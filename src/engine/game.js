/**
 * ============================================================================
 * game.js - 德州扑克游戏引擎 / Texas Hold'em Game Engine
 * ============================================================================
 * 管理完整的单挑德州扑克游戏流程，包括:
 * Manages complete heads-up Texas Hold'em game flow, including:
 * - 游戏阶段管理 (Preflop → Flop → Turn → River → Showdown)
 *   Game phase management
 * - 下注轮次控制 (行动顺序、最小加注额)
 *   Betting round control (action order, min raise)
 * - 底池与边池计算
 *   Pot and side pot calculation
 * - 胜负判定与筹码分配
 *   Win/loss determination and chip distribution
 */

import { createDeck, shuffleDeck } from './cards.js';
import { evaluateSevenCardHand, compareHands } from './evaluator.js';

/** 玩家行动类型 / Player action types */
const ACTION_FOLD = 'fold';       // 弃牌 / Fold
const ACTION_CHECK = 'check';     // 过牌 / Check
const ACTION_CALL = 'call';       // 跟注 / Call
const ACTION_BET = 'bet';         // 下注 / Bet
const ACTION_RAISE = 'raise';     // 加注 / Raise
const ACTION_ALL_IN = 'allin';    // 全押 / All-in

/** 游戏阶段 / Game phases */
const PHASE_PREFLOP = 'preflop';
const PHASE_FLOP = 'flop';
const PHASE_TURN = 'turn';
const PHASE_RIVER = 'river';
const PHASE_SHOWDOWN = 'showdown';
const PHASE_ENDED = 'ended';

/**
 * 创建新的游戏状态 / Create a new game state
 * @param {Object} config - 游戏配置 / Game configuration
 * @returns {Object} 游戏状态对象 / Game state object
 */
function createGameState(config = {}) {
    const bb = config.bigBlind || 100;        // 大盲注 / Big blind
    const sb = config.smallBlind || 50;       // 小盲注 / Small blind
    const stackSize = config.stackSize || 10000; // 初始筹码 / Initial stack

    return {
        // 配置 / Config
        bigBlind: bb,
        smallBlind: sb,
        stackSize: stackSize,

        // 牌组 / Deck
        deck: [],

        // 玩家信息 / Player info
        // 单挑中: 玩家0 = SB+BTN, 玩家1 = BB
        // Heads-up: player 0 = SB+BTN, player 1 = BB
        players: [
            {
                id: 0,
                name: 'Player 1 (BTN)',
                stack: stackSize,
                holeCards: [],
                isActive: true,       // 是否仍在手牌中 / Still in hand?
                isAllIn: false,       // 是否已全押 / All-in?
                totalInvested: 0      // 本手牌总投入 / Total invested this hand
            },
            {
                id: 1,
                name: 'Player 2 (BB)',
                stack: stackSize,
                holeCards: [],
                isActive: true,
                isAllIn: false,
                totalInvested: 0
            }
        ],

        // 公共牌 / Community cards
        communityCards: [],

        // 底池 / Pot
        mainPot: 0,
        sidePots: [], // [{amount, eligiblePlayers}] / 边池列表

        // 当前下注轮状态 / Current betting round state
        phase: PHASE_PREFLOP,
        currentPlayer: 0,         // 当前行动玩家 / Current acting player
        lastAggressor: -1,        // 最后加注者 / Last aggressor
        currentBet: 0,            // 当前最高下注额 / Current bet to call
        lastRaiseSize: bb,        // 上一次加注额 / Last raise size
        minRaise: bb,             // 最小加注额 / Minimum raise
        playerBets: [0, 0],       // 本轮各玩家已下注额 / Bets this round
        potContributions: [0, 0], // 各玩家总贡献 / Total contributions
        actionsThisRound: [[], []], // 本轮各玩家行动历史 / Action history
        streetBets: [],           // 当前街的下注记录 / Current street bet log

        // 游戏结果 / Game result
        winners: [],              // 获胜者 / Winners
        handHistory: [],          // 完整手牌历史 / Complete hand history
        handNumber: 0,            // 手牌编号 / Hand number

        // 状态标记 / State flags
        isHandComplete: false,
        isRandomSimulation: false // 是否为随机仿真 / Is random simulation?
    };
}

/**
 * 开始新的一手牌 / Start a new hand
 * @param {Object} state - 游戏状态 / Game state
 * @param {boolean} keepStacks - 是否保留筹码 / Keep current stacks?
 * @returns {Object} 更新后的状态 / Updated state
 */
function startNewHand(state, keepStacks = true) {
    const newState = { ...state };
    newState.deck = shuffleDeck(createDeck());
    newState.communityCards = [];
    newState.mainPot = 0;
    newState.sidePots = [];
    newState.phase = PHASE_PREFLOP;
    newState.currentPlayer = 0; // BTN/SB先行动 / BTN/SB acts first preflop
    newState.lastAggressor = -1;
    newState.currentBet = newState.bigBlind;
    newState.lastRaiseSize = newState.bigBlind;
    newState.minRaise = newState.bigBlind;
    newState.playerBets = [0, 0];
    newState.potContributions = [0, 0];
    newState.actionsThisRound = [[], []];
    newState.streetBets = [];
    newState.winners = [];
    newState.isHandComplete = false;
    newState.handNumber++;

    // 重置玩家状态 / Reset player states
    for (let i = 0; i < 2; i++) {
        if (!keepStacks) {
            newState.players[i].stack = newState.stackSize;
        }
        newState.players[i].holeCards = [];
        newState.players[i].isActive = true;
        newState.players[i].isAllIn = false;
        newState.players[i].totalInvested = 0;
    }

    // 发手牌 / Deal hole cards
    for (let i = 0; i < 2; i++) {
        for (let p = 0; p < 2; p++) {
            newState.players[p].holeCards.push(newState.deck.pop());
        }
    }

    // 投入盲注 / Post blinds
    const sbAmount = Math.min(newState.smallBlind, newState.players[0].stack);
    newState.players[0].stack -= sbAmount;
    newState.players[0].totalInvested = sbAmount;
    newState.playerBets[0] = sbAmount;
    newState.potContributions[0] = sbAmount;

    const bbAmount = Math.min(newState.bigBlind, newState.players[1].stack);
    newState.players[1].stack -= bbAmount;
    newState.players[1].totalInvested = bbAmount;
    newState.playerBets[1] = bbAmount;
    newState.potContributions[1] = bbAmount;

    // 如果BB不足额，调整currentBet / Adjust current bet if BB is short
    if (bbAmount < newState.bigBlind) {
        newState.currentBet = bbAmount;
    }

    newState.handHistory.push({
        handNumber: newState.handNumber,
        event: 'HAND_STARTED',
        blinds: [sbAmount, bbAmount]
    });

    return newState;
}

/**
 * 获取当前玩家可用的行动 / Get available actions for current player
 * @param {Object} state
 * @returns {string[]} 可用行动列表 / Available actions
 */
function getAvailableActions(state) {
    const p = state.currentPlayer;
    const player = state.players[p];

    if (!player.isActive || player.isAllIn) {
        return [];
    }

    const toCall = state.currentBet - state.playerBets[p];
    const actions = [];

    if (toCall === 0) {
        // 无人下注，可以过牌或下注 / No bet to call, can check or bet
        actions.push(ACTION_CHECK);
        if (player.stack > 0) {
            actions.push(ACTION_BET);
            actions.push(ACTION_ALL_IN);
        }
    } else {
        // 需要跟注 / Need to call
        if (player.stack >= toCall) {
            actions.push(ACTION_CALL);
        }
        actions.push(ACTION_FOLD);

        // 加注选项 / Raise options
        if (player.stack > toCall) {
            actions.push(ACTION_RAISE);
            actions.push(ACTION_ALL_IN);
        } else {
            // 筹码不足，只能全押跟注 / Not enough to call, can only all-in
            actions.push(ACTION_ALL_IN);
        }
    }

    return actions;
}

/**
 * 执行玩家行动 / Execute player action
 * @param {Object} state - 当前状态 / Current state
 * @param {string} action - 行动类型 / Action type
 * @param {number} amount - 下注/加注金额 (可选) / Bet/raise amount (optional)
 * @returns {Object} 更新后的状态 / Updated state
 */
function executeAction(state, action, amount = 0) {
    const newState = cloneState(state);
    const p = newState.currentPlayer;
    const player = newState.players[p];
    const toCall = newState.currentBet - newState.playerBets[p];

    if (!player.isActive || player.isAllIn) {
        return advancePlayer(newState);
    }

    const actionRecord = {
        player: p,
        action: action,
        amount: 0,
        phase: newState.phase,
        timestamp: Date.now()
    };

    switch (action) {
        case ACTION_FOLD:
            player.isActive = false;
            actionRecord.amount = 0;
            newState.handHistory.push({ ...actionRecord, event: 'FOLD' });
            break;

        case ACTION_CHECK:
            if (toCall !== 0) {
                throw new Error('Cannot check when there is a bet to call');
            }
            actionRecord.amount = 0;
            newState.handHistory.push({ ...actionRecord, event: 'CHECK' });
            break;

        case ACTION_CALL:
            const callAmount = Math.min(toCall, player.stack);
            player.stack -= callAmount;
            player.totalInvested += callAmount;
            newState.playerBets[p] += callAmount;
            newState.potContributions[p] += callAmount;
            actionRecord.amount = callAmount;
            newState.handHistory.push({ ...actionRecord, event: 'CALL' });

            if (player.stack === 0) {
                player.isAllIn = true;
            }
            break;

        case ACTION_BET:
            if (toCall !== 0) {
                throw new Error('Cannot bet when there is already a bet; use raise');
            }
            const betAmount = Math.min(Math.max(amount, newState.bigBlind), player.stack);
            player.stack -= betAmount;
            player.totalInvested += betAmount;
            newState.playerBets[p] += betAmount;
            newState.potContributions[p] += betAmount;
            newState.currentBet = newState.playerBets[p];
            newState.lastAggressor = p;
            newState.lastRaiseSize = betAmount;
            newState.minRaise = betAmount * 2;
            actionRecord.amount = betAmount;
            newState.handHistory.push({ ...actionRecord, event: 'BET' });

            if (player.stack === 0) {
                player.isAllIn = true;
            }
            break;

        case ACTION_RAISE:
            if (toCall === 0) {
                throw new Error('Cannot raise when there is no bet to call; use bet');
            }
            const minRaiseTotal = newState.currentBet + newState.lastRaiseSize;
            const raiseTo = Math.max(amount, minRaiseTotal);
            const totalNeeded = raiseTo - newState.playerBets[p];
            const actualTotal = Math.min(totalNeeded, player.stack);
            const actualRaiseTo = newState.playerBets[p] + actualTotal;

            player.stack -= actualTotal;
            player.totalInvested += actualTotal;
            newState.playerBets[p] = actualRaiseTo;
            newState.potContributions[p] += actualTotal;

            const actualRaiseSize = actualRaiseTo - newState.currentBet;
            if (actualRaiseSize > 0) {
                newState.lastRaiseSize = actualRaiseSize;
            }
            newState.currentBet = actualRaiseTo;
            newState.lastAggressor = p;
            newState.minRaise = actualRaiseTo + actualRaiseSize;
            actionRecord.amount = actualTotal;
            newState.handHistory.push({ ...actionRecord, event: 'RAISE', raiseTo: actualRaiseTo });

            if (player.stack === 0) {
                player.isAllIn = true;
            }
            break;

        case ACTION_ALL_IN:
            const allInAmount = player.stack;
            if (allInAmount === 0) break;

            player.stack = 0;
            player.isAllIn = true;
            const newTotal = newState.playerBets[p] + allInAmount;
            const added = allInAmount;
            player.totalInvested += added;
            newState.potContributions[p] += added;

            if (newTotal > newState.currentBet) {
                // 这是加注 / This is a raise
                const raiseSize = newTotal - newState.currentBet;
                if (raiseSize > newState.lastRaiseSize) {
                    newState.lastRaiseSize = raiseSize;
                    newState.minRaise = newTotal + raiseSize;
                }
                newState.currentBet = newTotal;
                newState.lastAggressor = p;
            }
            newState.playerBets[p] = newTotal;
            actionRecord.amount = added;
            newState.handHistory.push({ ...actionRecord, event: 'ALL_IN', totalBet: newTotal });
            break;
    }

    newState.actionsThisRound[p].push(action);
    newState.streetBets.push({ player: p, action, amount: actionRecord.amount });

    // 检查是否只剩一个活跃玩家 / Check if only one active player
    const activePlayers = newState.players.filter(pl => pl.isActive);
    if (activePlayers.length === 1) {
        return endHand(newState, activePlayers);
    }

    // 前进到下一位玩家 / Advance to next player
    return advancePlayer(newState);
}

/**
 * 前进到下一位玩家 / Advance to next player
 * @param {Object} state
 * @returns {Object}
 */
function advancePlayer(state) {
    const newState = cloneState(state);

    // 找到下一位可行动的玩家 / Find next active player
    let nextPlayer = (newState.currentPlayer + 1) % 2;
    let loops = 0;

    while (loops < 2) {
        const p = newState.players[nextPlayer];
        if (p.isActive && !p.isAllIn) {
            // 检查下注轮是否结束 / Check if betting round is complete
            if (isBettingRoundComplete(newState, nextPlayer)) {
                return advancePhase(newState);
            }
            newState.currentPlayer = nextPlayer;
            return newState;
        }
        // 如果玩家不活跃或已全押，检查是否结束 / If inactive or all-in, check completion
        if (isBettingRoundComplete(newState, nextPlayer)) {
            return advancePhase(newState);
        }
        nextPlayer = (nextPlayer + 1) % 2;
        loops++;
    }

    // 所有玩家都已全押或不活跃 / All players all-in or inactive
    return advancePhase(newState);
}

/**
 * 检查下注轮是否完成 / Check if betting round is complete
 * @param {Object} state
 * @param {number} nextPlayer - 下一个要行动的玩家 / Next player to act
 * @returns {boolean}
 */
function isBettingRoundComplete(state, nextPlayer) {
    // 如果只剩一个活跃玩家 / If only one active player
    const activePlayers = state.players.filter(p => p.isActive);
    if (activePlayers.length <= 1) return true;

    // 检查是否所有人都已行动且下注平衡 / Check if everyone acted and bets are balanced
    // 在翻前，BB需要有机会加注 / Preflop, BB needs chance to raise
    const p0 = state.players[0];
    const p1 = state.players[1];

    if (state.phase === PHASE_PREFLOP) {
        // 特殊处理翻前 / Special preflop handling
        // 如果BTN只是跟注了BB，轮到BB行动后BTN还有机会 / If BTN just called BB, BB acts then BTN gets chance
        if (state.actionsThisRound[0].length === 0 && state.actionsThisRound[1].length === 0) {
            return false; // 刚开始 / Just started
        }
    }

    // 检查是否所有活跃玩家都已匹配当前下注 / Check if all active players matched current bet
    for (let i = 0; i < 2; i++) {
        const p = state.players[i];
        if (!p.isActive || p.isAllIn) continue;
        if (state.playerBets[i] !== state.currentBet && p.stack > 0) {
            return false;
        }
    }

    // 确保每个人都至少有一次行动机会 (除非已全押) / Everyone had a chance to act
    if (state.phase === PHASE_PREFLOP) {
        // 翻前: BB至少有一次行动机会 / Preflop: BB needs at least one chance
        if (state.actionsThisRound[1].length === 0 && p1.isActive && !p1.isAllIn) {
            // 但如果BB已经投入足够 (例如BTN弃牌) / Unless BB already invested enough
            if (nextPlayer === 1) return false;
        }
    }

    // 检查最后 aggressor 是否已得到回应 / Check if last aggressor was responded to
    if (state.lastAggressor !== -1) {
        const aggressor = state.lastAggressor;
        const other = 1 - aggressor;
        const otherPlayer = state.players[other];
        if (otherPlayer.isActive && !otherPlayer.isAllIn) {
            if (state.playerBets[other] !== state.currentBet) {
                return false;
            }
        }
    }

    // 如果轮到某玩家行动且他已匹配下注，轮次结束 / If next player already matched, round ends
    if (state.playerBets[nextPlayer] === state.currentBet) {
        // 但要确保不是刚开始 / But ensure not just started
        const totalActions = state.actionsThisRound[0].length + state.actionsThisRound[1].length;
        if (totalActions >= 2) return true;
    }

    // 所有人都过牌 / Everyone checked
    const allChecked = state.players.every((p, i) =>
        !p.isActive || p.isAllIn || state.actionsThisRound[i].includes(ACTION_CHECK)
    );
    if (allChecked && state.currentBet === state.bigBlind && state.phase === PHASE_PREFLOP) {
        // 翻前特例: BB有过牌选项 / Preflop special: BB can check
        if (state.actionsThisRound[1].length > 0) return true;
    }

    return false;
}

/**
 * 进入下一阶段 / Advance to next phase
 * @param {Object} state
 * @returns {Object}
 */
function advancePhase(state) {
    const newState = cloneState(state);

    // 将当前下注加入底池 / Add current bets to pot
    for (let i = 0; i < 2; i++) {
        newState.mainPot += newState.playerBets[i];
        newState.playerBets[i] = 0;
    }
    newState.currentBet = 0;
    newState.lastAggressor = -1;
    newState.lastRaiseSize = newState.bigBlind;
    newState.minRaise = newState.bigBlind;
    newState.actionsThisRound = [[], []];
    newState.streetBets = [];

    // 发公共牌 / Deal community cards
    switch (newState.phase) {
        case PHASE_PREFLOP:
            newState.phase = PHASE_FLOP;
            newState.communityCards.push(newState.deck.pop(), newState.deck.pop(), newState.deck.pop());
            newState.currentPlayer = 1; // BB先行动 / BB acts first postflop
            break;
        case PHASE_FLOP:
            newState.phase = PHASE_TURN;
            newState.communityCards.push(newState.deck.pop());
            newState.currentPlayer = 1;
            break;
        case PHASE_TURN:
            newState.phase = PHASE_RIVER;
            newState.communityCards.push(newState.deck.pop());
            newState.currentPlayer = 1;
            break;
        case PHASE_RIVER:
            return showdown(newState);
    }

    // 检查是否只剩一个活跃玩家 / Check if only one active
    const active = newState.players.filter(p => p.isActive);
    if (active.length === 1) {
        return endHand(newState, active);
    }

    // 如果当前行动玩家已全押，继续前进 / If current player is all-in, advance
    if (!newState.players[newState.currentPlayer].isActive ||
        newState.players[newState.currentPlayer].isAllIn) {
        return advancePlayer(newState);
    }

    return newState;
}

/**
 * 摊牌阶段 / Showdown phase
 * @param {Object} state
 * @returns {Object}
 */
function showdown(state) {
    const newState = cloneState(state);
    newState.phase = PHASE_SHOWDOWN;

    // 将剩余下注加入底池 / Add remaining bets to pot
    for (let i = 0; i < 2; i++) {
        newState.mainPot += newState.playerBets[i];
        newState.playerBets[i] = 0;
    }

    // 评估手牌 / Evaluate hands
    const activePlayers = newState.players.filter(p => p.isActive);
    const handEvals = activePlayers.map(p => ({
        player: p,
        eval: evaluateSevenCardHand([...p.holeCards, ...newState.communityCards])
    }));

    // 找出胜者 / Find winners
    let bestStrength = -1;
    const winners = [];

    for (const he of handEvals) {
        if (he.eval.strength > bestStrength) {
            bestStrength = he.eval.strength;
            winners.length = 0;
            winners.push(he.player);
        } else if (he.eval.strength === bestStrength) {
            winners.push(he.player);
        }
    }

    // 分配底池 / Distribute pot
    const potPerWinner = Math.floor(newState.mainPot / winners.length);
    const remainder = newState.mainPot % winners.length;

    for (let i = 0; i < winners.length; i++) {
        const winAmount = potPerWinner + (i < remainder ? 1 : 0);
        const pIdx = winners[i].id;
        newState.players[pIdx].stack += winAmount;
    }

    newState.winners = winners.map(w => ({
        id: w.id,
        name: w.name,
        holeCards: w.holeCards,
        handType: handEvals.find(he => he.player.id === w.id).eval.handType,
        strength: handEvals.find(he => he.player.id === w.id).eval.strength,
        winAmount: potPerWinner + (winners.indexOf(w) < remainder ? 1 : 0)
    }));

    newState.mainPot = 0;
    newState.isHandComplete = true;
    newState.phase = PHASE_ENDED;

    newState.handHistory.push({
        event: 'SHOWDOWN',
        winners: newState.winners,
        communityCards: [...newState.communityCards]
    });

    return newState;
}

/**
 * 非摊牌结束 (某玩家弃牌) / End hand without showdown (someone folded)
 * @param {Object} state
 * @param {Array} winners - 剩余活跃玩家 / Remaining active players
 * @returns {Object}
 */
function endHand(state, winners) {
    const newState = cloneState(state);

    // 加入剩余下注 / Add remaining bets
    for (let i = 0; i < 2; i++) {
        newState.mainPot += newState.playerBets[i];
        newState.playerBets[i] = 0;
    }

    // 胜者获得底池 / Winner gets the pot
    const winner = winners[0];
    const pIdx = winner.id;
    newState.players[pIdx].stack += newState.mainPot;

    newState.winners = [{
        id: winner.id,
        name: winner.name,
        holeCards: winner.holeCards,
        winAmount: newState.mainPot,
        byFold: true
    }];

    newState.mainPot = 0;
    newState.isHandComplete = true;
    newState.phase = PHASE_ENDED;

    newState.handHistory.push({
        event: 'FOLD_WIN',
        winner: winner.id,
        winAmount: newState.winners[0].winAmount
    });

    return newState;
}

/**
 * 深拷贝游戏状态 / Deep clone game state
 * @param {Object} state
 * @returns {Object}
 */
function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
}

/**
 * 获取当前底池总额 / Get total pot amount
 * @param {Object} state
 * @returns {number}
 */
function getTotalPot(state) {
    let total = state.mainPot;
    for (const bet of state.playerBets) {
        total += bet;
    }
    for (const sp of state.sidePots) {
        total += sp.amount;
    }
    return total;
}

/**
 * 获取当前需要跟注的金额 / Get amount needed to call
 * @param {Object} state
 * @param {number} playerId
 * @returns {number}
 */
function getAmountToCall(state, playerId) {
    return state.currentBet - state.playerBets[playerId];
}

/**
 * 获取底池赔率 / Get pot odds
 * @param {Object} state
 * @param {number} playerId
 * @returns {number} 百分比 / Percentage
 */
function getPotOdds(state, playerId) {
    const toCall = getAmountToCall(state, playerId);
    const pot = getTotalPot(state);
    if (toCall === 0) return 0;
    return toCall / (pot + toCall);
}

/**
 * 获取最小防守频率 / Get Minimum Defense Frequency
 * @param {Object} state
 * @param {number} playerId
 * @returns {number}
 */
function getMDF(state, playerId) {
    const toCall = getAmountToCall(state, playerId);
    const pot = getTotalPot(state);
    if (toCall === 0) return 1.0;
    return 1 - toCall / (pot + toCall);
}

export {
    // 常量 / Constants
    ACTION_FOLD, ACTION_CHECK, ACTION_CALL, ACTION_BET, ACTION_RAISE, ACTION_ALL_IN,
    PHASE_PREFLOP, PHASE_FLOP, PHASE_TURN, PHASE_RIVER, PHASE_SHOWDOWN, PHASE_ENDED,

    // 函数 / Functions
    createGameState, startNewHand, getAvailableActions, executeAction,
    getTotalPot, getAmountToCall, getPotOdds, getMDF,
    cloneState
};
