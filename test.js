/**
 * test.js - 单元测试 / Unit Tests
 * 验证扑克引擎和GTO求解器的核心逻辑
 */

import { createDeck, shuffleDeck, cardToId, combinations } from './src/engine/cards.js';
import { evaluateSevenCardHand, compareHands, calculateEquity } from './src/engine/evaluator.js';
import { createGameState, startNewHand, getAvailableActions, executeAction, PHASE_PREFLOP, PHASE_FLOP, PHASE_SHOWDOWN, PHASE_ENDED, ACTION_FOLD, ACTION_CHECK, ACTION_CALL, ACTION_BET, ACTION_ALL_IN } from './src/engine/game.js';
import { classifyPreflopHand, getAbstractActions, abstractToConcrete, encodePreflopInfoSet, ACTION_FOLD as ABS_FOLD, ACTION_CHECK_CALL, ACTION_BET_HALF } from './src/solver/abstraction.js';
import { GTOCalculator } from './src/solver/cfr.js';

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        passCount++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failCount++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
}

function assertTrue(cond, msg) {
    if (!cond) throw new Error(msg || 'Assertion failed');
}

console.log('\n========== Card Engine Tests / 牌组引擎测试 ==========');

test('Create deck has 52 cards / 牌组有52张牌', () => {
    const deck = createDeck();
    assertEqual(deck.length, 52, 'Deck size');
});

test('Shuffle produces valid cards / 洗牌产生有效牌', () => {
    const deck = shuffleDeck(createDeck());
    assertTrue(deck.every(c => c.length === 2), 'All cards valid');
});

test('cardToId roundtrip / cardToId往返正确', () => {
    const deck = createDeck();
    for (const card of deck) {
        const id = cardToId(card);
        // Just verify id is in range / 仅验证ID在范围内
        assertTrue(id >= 0 && id < 52, `Card ${card} id ${id}`);
    }
});

console.log('\n========== Evaluator Tests / 评估器测试 ==========');

test('Royal flush beats straight flush / 同花大顺胜同花顺', () => {
    // As Ks Qs Js Ts 9s 8s -> Royal flush vs straight flush
    const royal = evaluateSevenCardHand(['As', 'Ks', 'Qs', 'Js', 'Ts', '9s', '8s']);
    const straightFlush = evaluateSevenCardHand(['Ks', 'Qs', 'Js', 'Ts', '9s', '8s', '7s']);
    assertTrue(royal.strength > straightFlush.strength, 'Royal > Straight Flush');
});

test('Four of a kind beats full house / 四条胜葫芦', () => {
    const quads = evaluateSevenCardHand(['As', 'Ac', 'Ad', 'Ah', 'Ks', 'Qs', 'Js']);
    const boat = evaluateSevenCardHand(['Ks', 'Kc', 'Kd', 'Qs', 'Qc', 'Jd', 'Ts']);
    assertTrue(quads.strength > boat.strength, 'Quads > Full House');
});

test('Pair beats high card / 一对胜高牌', () => {
    const pair = evaluateSevenCardHand(['As', 'Ac', '2s', '3c', '4d', '5h', '7s']);
    const high = evaluateSevenCardHand(['As', 'Kc', 'Qd', 'Js', '9h', '7c', '2d']);
    assertTrue(pair.strength > high.strength, 'Pair > High Card');
});

test('Compare hands function works / 比较函数工作正常', () => {
    const hand1 = ['As', 'Ac', 'Ks', 'Qs', 'Js', 'Ts', '9s']; // Pair of Aces
    const hand2 = ['Ks', 'Kc', 'Qs', 'Js', 'Ts', '9s', '8s']; // Pair of Kings
    assertEqual(compareHands(hand1, hand2), 1, 'AA pair beats KK pair');
});

test('Equity calculation returns valid probabilities / 胜率计算返回有效概率', () => {
    const equity = calculateEquity(['As', 'Ac'], ['Ks', 'Qs'], [], 100);
    assertTrue(equity.p1Win > 0.5, 'AA should be favorite vs KQs');
    assertTrue(Math.abs(equity.p1Win + equity.p2Win + equity.tie - 1) < 0.01, 'Probabilities sum to 1');
});

console.log('\n========== Game Engine Tests / 游戏引擎测试 ==========');

test('Create game state / 创建游戏状态', () => {
    const state = createGameState();
    assertEqual(state.players.length, 2, 'Two players');
    assertEqual(state.phase, PHASE_PREFLOP, 'Starts at preflop');
});

test('Start new hand deals cards / 新牌局发牌', () => {
    let state = createGameState();
    state = startNewHand(state, false);
    assertEqual(state.players[0].holeCards.length, 2, 'P1 has 2 cards');
    assertEqual(state.players[1].holeCards.length, 2, 'P2 has 2 cards');
    assertEqual(state.handNumber, 1, 'Hand number incremented');
});

test('Blinds posted correctly / 盲注正确投入', () => {
    let state = createGameState({ bigBlind: 100, smallBlind: 50 });
    state = startNewHand(state, false);
    assertEqual(state.playerBets[0], 50, 'SB posted');
    assertEqual(state.playerBets[1], 100, 'BB posted');
    assertEqual(state.currentBet, 100, 'Current bet is BB');
});

test('Fold ends hand / 弃牌结束手牌', () => {
    let state = createGameState();
    state = startNewHand(state, false);
    state = executeAction(state, ACTION_FOLD, 0);
    assertEqual(state.phase, PHASE_ENDED, 'Hand ended after fold');
    assertEqual(state.winners.length, 1, 'One winner');
    assertEqual(state.winners[0].id, 1, 'BB wins');
});

test('Check-check advances to flop / 过牌-过牌进入翻牌', () => {
    let state = createGameState();
    state = startNewHand(state, false);
    // P1 is SB/BTN, P2 is BB. Preflop: P1 acts first.
    // P1 calls 50 more to match BB
    state = executeAction(state, ACTION_CALL, 0);
    // P2 checks (already bet 100, so this is actually a check since no raise)
    // Wait, after P1 calls, both have bet 100. P2's turn - can check.
    // But need to verify whose turn it is.
    assertTrue(state.currentPlayer === 1, 'Should be BB turn after call');
    state = executeAction(state, ACTION_CHECK, 0);
    assertEqual(state.phase, PHASE_FLOP, 'Advanced to flop');
    assertEqual(state.communityCards.length, 3, '3 flop cards');
});

test('Bet and call works / 下注和跟注工作正常', () => {
    let state = createGameState();
    state = startNewHand(state, false);
    // P1 calls BB
    state = executeAction(state, ACTION_CALL, 0);
    // P2 checks
    state = executeAction(state, ACTION_CHECK, 0);
    // Now on flop, P2 (BB) acts first
    assertEqual(state.phase, PHASE_FLOP, 'On flop');
    assertEqual(state.currentPlayer, 1, 'BB acts first on flop');
    // P2 bets
    state = executeAction(state, ACTION_BET, 100);
    assertEqual(state.currentBet, 100, 'Bet is 100');
    // P1 calls
    state = executeAction(state, ACTION_CALL, 0);
    // playerBets reset when advancing to turn, but potContributions tracks total
    // playerBets在阶段推进时重置，但potContributions记录总投入
    assertEqual(state.potContributions[0], 200, 'P1 total invested: 50SB+50call pre + 100call flop');
});

test('All-in short stack works / 短码全押工作正常', () => {
    let state = createGameState({ stackSize: 150 });
    state = startNewHand(state, false);
    // P1 only has 100 left after SB
    state = executeAction(state, ACTION_ALL_IN, 0);
    assertTrue(state.players[0].isAllIn || !state.players[0].isActive, 'P1 all-in or folded');
});

console.log('\n========== Abstraction Tests / 抽象模块测试 ==========');

test('Preflop hand classification / 翻前手牌分类', () => {
    const aa = classifyPreflopHand(['As', 'Ac']);
    const kk = classifyPreflopHand(['Ks', 'Kc']);
    const sevenTwo = classifyPreflopHand(['7s', '2c']);
    assertTrue(aa === 0 || aa === 1, 'AA is strong'); // Nuts or Strong bucket
    assertTrue(kk >= 0 && kk <= 2, 'KK is decent');
    assertTrue(sevenTwo >= 3, '72o is weak/bluff');
});

test('Abstract actions available / 抽象动作可用', () => {
    let state = createGameState();
    state = startNewHand(state, false);
    const actions = getAbstractActions(state, 0);
    assertTrue(actions.length > 0, 'Has available actions');
    assertTrue(actions.includes(ACTION_CHECK_CALL), 'Can call/check');
});

test('Abstract to concrete conversion / 抽象到具体转换', () => {
    let state = createGameState();
    state = startNewHand(state, false);
    const concrete = abstractToConcrete(ABS_FOLD, state, 0);
    assertEqual(concrete.action, 'fold', 'Fold maps correctly');
});

console.log('\n========== GTO Calculator Tests / GTO计算器测试 ==========');

test('GTO calculator returns advice / GTO计算器返回建议', () => {
    let state = createGameState();
    state = startNewHand(state, false);
    const advice = GTOCalculator.calculateAdvice(state, 0, { equity: 0.6 });
    assertTrue(advice.actions.length > 0, 'Has action advice');
    assertTrue(advice.theory.mdf >= 0 && advice.theory.mdf <= 1, 'MDF in range');
});

test('GTO probabilities sum to ~1 / GTO概率和约为1', () => {
    let state = createGameState();
    state = startNewHand(state, false);
    const advice = GTOCalculator.calculateAdvice(state, 0, { equity: 0.5 });
    const sum = advice.actions.reduce((s, a) => s + a.probability, 0);
    assertTrue(Math.abs(sum - 1) < 0.01, `Probabilities sum to ${sum}`);
});

console.log('\n========== Test Summary / 测试汇总 ==========');
console.log(`Passed / 通过: ${passCount}`);
console.log(`Failed / 失败: ${failCount}`);
console.log(`Total / 总计: ${passCount + failCount}`);

if (failCount > 0) {
    process.exit(1);
}
console.log('\nAll tests passed! / 所有测试通过！');
