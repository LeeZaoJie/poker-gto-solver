/**
 * integration-test.js - 集成测试 / Integration Tests
 * 模拟完整游戏流程，验证引擎、求解器和UI逻辑的协同工作
 */

import { createGameState, startNewHand, executeAction, ACTION_FOLD, ACTION_CHECK, ACTION_CALL, ACTION_BET, ACTION_RAISE, ACTION_ALL_IN, PHASE_PREFLOP, PHASE_FLOP, PHASE_TURN, PHASE_RIVER, PHASE_SHOWDOWN, PHASE_ENDED } from './src/engine/game.js';
import { evaluateSevenCardHand } from './src/engine/evaluator.js';
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

console.log('\n========== Integration Tests / 集成测试 ==========');

// Test 1: Complete hand with showdown / 完整摊牌对局
test('Complete hand: call preflop, bet flop, call turn, check river / 完整对局', () => {
    let state = createGameState({ stackSize: 5000 });
    state = startNewHand(state, false);

    // Preflop: P1 calls, P2 checks
    state = executeAction(state, ACTION_CALL, 0);
    state = executeAction(state, ACTION_CHECK, 0);
    assertEqual(state.phase, PHASE_FLOP, 'Should be on flop');
    assertEqual(state.communityCards.length, 3, '3 community cards');

    // Flop: P2 bets, P1 calls
    state = executeAction(state, ACTION_BET, 150);
    assertEqual(state.currentBet, 150, 'Flop bet is 150');
    state = executeAction(state, ACTION_CALL, 0);

    // Should advance to turn
    assertEqual(state.phase, PHASE_TURN, 'Should be on turn');
    assertEqual(state.communityCards.length, 4, '4 community cards');

    // Turn: P2 bets, P1 calls
    state = executeAction(state, ACTION_BET, 300);
    state = executeAction(state, ACTION_CALL, 0);

    // Should advance to river
    assertEqual(state.phase, PHASE_RIVER, 'Should be on river');
    assertEqual(state.communityCards.length, 5, '5 community cards');

    // River: P2 checks, P1 checks
    state = executeAction(state, ACTION_CHECK, 0);
    state = executeAction(state, ACTION_CHECK, 0);

    // Showdown
    assertEqual(state.phase, PHASE_ENDED, 'Hand should be complete');
    assertTrue(state.winners.length >= 1, 'Should have at least one winner');
    assertTrue(state.players[0].stack + state.players[1].stack === 10000, 'Total chips conserved');
});

// Test 2: Preflop raise and fold / 翻前加注并弃牌
test('Preflop raise, opponent folds / 翻前加注对手弃牌', () => {
    let state = createGameState();
    state = startNewHand(state, false);

    // P1 raises
    state = executeAction(state, ACTION_RAISE, 300);
    assertEqual(state.currentBet, 300, 'Raise to 300');

    // P2 folds
    state = executeAction(state, ACTION_FOLD, 0);
    assertEqual(state.phase, PHASE_ENDED, 'Hand ended');
    assertEqual(state.winners[0].id, 0, 'P1 wins');
    assertTrue(state.winners[0].byFold, 'Won by fold');
});

// Test 3: All-in confrontation / 全押对抗
test('All-in confrontation / 全押对抗', () => {
    let state = createGameState({ stackSize: 1000 });
    state = startNewHand(state, false);

    // P1 goes all-in
    state = executeAction(state, ACTION_ALL_IN, 0);
    assertTrue(state.players[0].isAllIn, 'P1 is all-in');

    // P2 calls
    state = executeAction(state, ACTION_CALL, 0);

    // Should go to showdown directly (or through streets if both all-in)
    assertEqual(state.phase, PHASE_ENDED, 'Hand ended after all-in call');
    assertTrue(state.winners.length >= 1, 'Has winner');
});

// Test 4: GTO advice at each street / 各阶段GTO建议
test('GTO advice across all streets / 各街GTO建议', () => {
    let state = createGameState();
    state = startNewHand(state, false);

    // Preflop advice
    let advice = GTOCalculator.calculateAdvice(state, 0, { equity: 0.55 });
    assertTrue(advice.actions.length >= 2, 'Has multiple preflop actions');
    assertTrue(advice.theory.potOdds >= 0, 'Pot odds valid');

    // Go to flop
    state = executeAction(state, ACTION_CALL, 0);
    state = executeAction(state, ACTION_CHECK, 0);
    assertEqual(state.phase, PHASE_FLOP, 'On flop');

    // Flop advice
    advice = GTOCalculator.calculateAdvice(state, 1, { equity: 0.45 });
    assertTrue(advice.actions.length >= 2, 'Has flop actions');
    assertTrue(advice.theory.mdf >= 0 && advice.theory.mdf <= 1, 'MDF valid');
});

// Test 5: Hand evaluation with community cards / 带公共牌的牌力评估
test('Hand evaluation consistency / 牌力评估一致性', () => {
    let state = createGameState();
    state = startNewHand(state, false);
    state = executeAction(state, ACTION_CALL, 0);
    state = executeAction(state, ACTION_CHECK, 0);

    // Evaluate both players
    const p0Eval = evaluateSevenCardHand([...state.players[0].holeCards, ...state.communityCards]);
    const p1Eval = evaluateSevenCardHand([...state.players[1].holeCards, ...state.communityCards]);

    assertTrue(p0Eval.strength > 0, 'P0 has valid hand strength');
    assertTrue(p1Eval.strength > 0, 'P1 has valid hand strength');
    assertTrue(p0Eval.handType.length > 0, 'Hand type has name');
});

// Test 6: Chip conservation / 筹码守恒
test('Chip conservation across multiple hands / 多手牌筹码守恒', () => {
    let state = createGameState({ stackSize: 2000 });

    for (let i = 0; i < 5; i++) {
        state = startNewHand(state, true);
        // Random actions until hand ends
        let safety = 0;
        while (!state.isHandComplete && safety < 20) {
            const p = state.currentPlayer;
            const avail = [];
            // Simplified available actions
            if (state.players[p].isActive && !state.players[p].isAllIn) {
                const toCall = state.currentBet - state.playerBets[p];
                if (toCall === 0) {
                    avail.push(ACTION_CHECK, ACTION_BET);
                } else {
                    avail.push(ACTION_FOLD, ACTION_CALL);
                }
            }
            if (avail.length === 0) break;
            const action = avail[Math.floor(Math.random() * avail.length)];
            let amount = 0;
            if (action === ACTION_BET) amount = state.bigBlind;
            try {
                state = executeAction(state, action, amount);
            } catch (e) {
                break;
            }
            safety++;
        }
    }

    const totalChips = state.players[0].stack + state.players[1].stack;
    assertEqual(totalChips, 4000, 'Total chips should be conserved');
});

// Test 7: Reveal all cards mode / 显示所有牌模式
test('Revealing opponent cards works / 显示对手牌功能', () => {
    let state = createGameState();
    state = startNewHand(state, false);

    assertTrue(state.players[0].holeCards.length === 2, 'P1 has cards');
    assertTrue(state.players[1].holeCards.length === 2, 'P2 has cards');
    assertTrue(state.players[0].holeCards[0] !== state.players[1].holeCards[0], 'Different cards');
});

// Test 8: Side pot edge case / 边池边界情况（深筹码）
test('Deep stack play / 深筹码游戏', () => {
    let state = createGameState({ stackSize: 50000 });
    state = startNewHand(state, false);

    // Multiple raises
    state = executeAction(state, ACTION_RAISE, 400);
    state = executeAction(state, ACTION_RAISE, 1200);
    state = executeAction(state, ACTION_CALL, 0);
    assertEqual(state.phase, PHASE_FLOP, 'Advanced to flop after big raises');
});

console.log('\n========== Integration Test Summary / 集成测试汇总 ==========');
console.log(`Passed / 通过: ${passCount}`);
console.log(`Failed / 失败: ${failCount}`);
console.log(`Total / 总计: ${passCount + failCount}`);

if (failCount > 0) {
    process.exit(1);
}
console.log('\nAll integration tests passed! / 所有集成测试通过！');
