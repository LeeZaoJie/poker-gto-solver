/**
 * ============================================================================
 * abstraction.js - 扑克抽象模块 / Poker Abstraction Module
 * ============================================================================
 * 由于完整的德州扑克信息集空间过于庞大 (~10^160)，必须通过抽象将其压缩
 * Since the full Texas Hold'em information set space is too vast (~10^160),
 * we must compress it through abstraction.
 *
 * 本模块实现:
 * This module implements:
 * 1. 手牌抽象 (Card Abstraction) - 将手牌按胜率分为若干桶
 *    Hand abstraction - group hands into buckets by equity
 * 2. 下注抽象 (Bet Abstraction) - 离散化下注尺寸
 *    Bet abstraction - discretize bet sizes
 * 3. 信息集编码 (Information Set Encoding) - 将游戏状态编码为字符串键
 *    Information set encoding - encode game state as string keys
 */

import { evaluateSevenCardHand } from '../engine/evaluator.js';

// ============================================================================
// 手牌抽象 / Hand Abstraction
// ============================================================================

/** 手牌桶分类 / Hand bucket categories */
const HAND_BUCKETS = {
    NUTS: 0,        // 绝对强牌 ( nuts / near-nuts)
    STRONG: 1,      // 强牌 / Strong made hands
    MEDIUM: 2,      // 中等牌力 / Medium strength
    WEAK: 3,        // 弱牌 / Weak hands
    BLUFF: 4,       // 纯诈唬 / Pure bluff (very weak)
    DRAW: 5         // 听牌 / Drawing hands
};

const BUCKET_NAMES = [
    'Nuts/绝对强牌', 'Strong/强牌', 'Medium/中等',
    'Weak/弱牌', 'Bluff/诈唬', 'Draw/听牌'
];

/**
 * 计算手牌桶分类 (基于手牌vs随机牌的胜率) / Calculate hand bucket
 * @param {string[]} holeCards - 2张手牌
 * @param {string[]} communityCards - 公共牌 (0-5张)
 * @returns {number} 桶ID (0-5)
 */
function classifyHandBucket(holeCards, communityCards = []) {
    // 如果是翻前，使用预计算的胜率范围 / Preflop: use precomputed equity ranges
    if (communityCards.length === 0) {
        return classifyPreflopHand(holeCards);
    }

    // 翻后: 使用蒙特卡洛估算当前胜率 / Postflop: Monte Carlo equity estimation
    // 简化处理: 基于牌型强度分类 / Simplified: classify by hand type
    const best = evaluateSevenCardHand([...holeCards, ...communityCards]);

    // 根据牌型等级和公共牌关联度分类 / Classify by hand rank and board connectivity
    const handType = best.strength >>> 20;

    // 听牌检测 / Draw detection
    const hasDraw = detectDraw(holeCards, communityCards);

    if (handType >= 7) return HAND_BUCKETS.NUTS;       // 四条+/ Four of a kind+
    if (handType >= 6) return HAND_BUCKETS.STRONG;      // 同花+/ Flush+
    if (handType >= 4) return HAND_BUCKETS.MEDIUM;      // 三条+/ Three of a kind+
    if (hasDraw) return HAND_BUCKETS.DRAW;              // 听牌 / Draw
    if (handType >= 2) return HAND_BUCKETS.WEAK;        // 一对+/ One pair+
    return HAND_BUCKETS.BLUFF;                          // 高牌无听牌 / High card no draw
}

/**
 * 翻前手牌分类 (基于手牌强度) / Preflop hand classification
 * 使用标准的翻前手牌分组 / Standard preflop hand groupings
 */
function classifyPreflopHand(holeCards) {
    const [c1, c2] = holeCards;
    const r1 = '23456789TJQKA'.indexOf(c1[0]);
    const r2 = '23456789TJQKA'.indexOf(c2[0]);
    const suited = c1[1] === c2[1];
    const pair = r1 === r2;
    const high = Math.max(r1, r2);
    const low = Math.min(r1, r2);

    // 对子分类 / Pairs
    if (pair) {
        if (high >= 11) return HAND_BUCKETS.NUTS;       // AA, KK / AA, KK
        if (high >= 9) return HAND_BUCKETS.STRONG;      // QQ, JJ, TT
        if (high >= 7) return HAND_BUCKETS.MEDIUM;      // 88, 99
        return HAND_BUCKETS.WEAK;                        // 22-77
    }

    // 非同花 / Offsuit
    if (!suited) {
        if (high === 12 && low >= 10) return HAND_BUCKETS.STRONG; // AKo, AQo, AJo, KQo
        if (high === 12 && low >= 8) return HAND_BUCKETS.MEDIUM;  // ATo, A9o
        if (high === 11 && low >= 10) return HAND_BUCKETS.MEDIUM; // KQo, KJo
        if (high >= 10 && low >= 9) return HAND_BUCKETS.MEDIUM;   // KJo+, QJo
        if (high - low <= 3 && high >= 8) return HAND_BUCKETS.WEAK; // Connected broadway
        return HAND_BUCKETS.BLUFF;
    }

    // 同花 / Suited
    if (high === 12 && low >= 9) return HAND_BUCKETS.STRONG;  // AKs-A9s
    if (high === 12 && low >= 5) return HAND_BUCKETS.MEDIUM;  // A8s-A5s
    if (high >= 10 && low >= 8) return HAND_BUCKETS.MEDIUM;   // KQs, KJs, QJs
    if (high >= 9 && low >= 7) return HAND_BUCKETS.MEDIUM;    // KTs, QTs, JTs
    if (high - low <= 2 && high >= 7) return HAND_BUCKETS.WEAK; // Suited connectors
    if (high - low <= 3 && high >= 5) return HAND_BUCKETS.WEAK;
    return HAND_BUCKETS.BLUFF;
}

/**
 * 检测听牌 / Detect drawing hands
 * @param {string[]} holeCards
 * @param {string[]} communityCards (3-4张)
 * @returns {boolean}
 */
function detectDraw(holeCards, communityCards) {
    // 简化检测: 同花听牌或顺子听牌 / Simplified: flush draw or straight draw
    const allCards = [...holeCards, ...communityCards];

    // 同花听牌检测 / Flush draw check
    const suitCounts = {};
    for (const c of allCards) {
        const s = c[1];
        suitCounts[s] = (suitCounts[s] || 0) + 1;
    }
    if (Object.values(suitCounts).some(c => c >= 4)) return true;

    // 顺子听牌检测 (简化) / Straight draw check (simplified)
    const ranks = [...new Set(allCards.map(c => '23456789TJQKA'.indexOf(c[0])))].sort((a, b) => a - b);
    if (ranks.length >= 4) {
        for (let i = 0; i <= ranks.length - 4; i++) {
            if (ranks[i + 3] - ranks[i] <= 4) return true;
        }
    }

    return false;
}

// ============================================================================
// 下注抽象 / Bet Abstraction
// ============================================================================

/** 离散化下注动作 / Discretized betting actions */
const ACTION_FOLD = 0;
const ACTION_CHECK_CALL = 1;   // 过牌或跟注 / Check or call
const ACTION_BET_HALF = 2;     // 1/2池下注 / Half pot bet
const ACTION_BET_POT = 3;      // 满池下注 / Pot size bet
const ACTION_BET_ALLIN = 4;    // 全押 / All-in

const ACTION_NAMES = ['Fold/弃牌', 'Check-Call/过牌-跟注', 'Bet 1/2 Pot/半池下注', 'Bet Pot/满池下注', 'All-in/全押'];

/**
 * 获取当前状态下可用的离散动作 / Get available discretized actions
 * @param {Object} gameState - 游戏状态
 * @param {number} playerId
 * @returns {number[]} 可用动作ID列表
 */
function getAbstractActions(gameState, playerId) {
    const p = gameState.players[playerId];
    const toCall = gameState.currentBet - gameState.playerBets[playerId];
    const pot = gameState.mainPot + gameState.playerBets[0] + gameState.playerBets[1];
    const actions = [];

    if (!p.isActive || p.isAllIn) return actions;

    if (toCall === 0) {
        // 可以过牌 / Can check
        actions.push(ACTION_CHECK_CALL);

        // 下注选项 / Betting options
        const halfPot = Math.floor(pot / 2);
        const potSize = pot;

        if (p.stack > 0) actions.push(ACTION_BET_ALLIN);
        if (p.stack >= halfPot) actions.push(ACTION_BET_HALF);
        if (p.stack >= potSize) actions.push(ACTION_BET_POT);
    } else {
        // 需要跟注 / Need to call
        actions.push(ACTION_FOLD);

        if (p.stack >= toCall) {
            actions.push(ACTION_CHECK_CALL); // 作为跟注 / As call
        }

        // 加注选项 / Raising options
        const halfPotRaise = Math.floor(pot * 0.75); // 跟注+3/4池 = 约半池加注
        const potRaise = pot + toCall; // 满池加注

        if (p.stack > toCall) {
            if (p.stack >= halfPotRaise) actions.push(ACTION_BET_HALF);
            if (p.stack >= potRaise) actions.push(ACTION_BET_POT);
            actions.push(ACTION_BET_ALLIN);
        } else {
            actions.push(ACTION_BET_ALLIN); // 不足跟注，全押 / Not enough to call, all-in
        }
    }

    return [...new Set(actions)].sort((a, b) => a - b);
}

/**
 * 将抽象动作转换为实际游戏动作 / Convert abstract action to concrete game action
 * @param {number} abstractAction
 * @param {Object} gameState
 * @param {number} playerId
 * @returns {Object} {action: string, amount: number}
 */
function abstractToConcrete(abstractAction, gameState, playerId) {
    const p = gameState.players[playerId];
    const toCall = gameState.currentBet - gameState.playerBets[playerId];
    const pot = gameState.mainPot + gameState.playerBets[0] + gameState.playerBets[1];

    switch (abstractAction) {
        case ACTION_FOLD:
            return { action: 'fold', amount: 0 };

        case ACTION_CHECK_CALL:
            if (toCall === 0) {
                return { action: 'check', amount: 0 };
            } else {
                return { action: 'call', amount: toCall };
            }

        case ACTION_BET_HALF: {
            let amount;
            if (toCall === 0) {
                amount = Math.floor(pot / 2);
            } else {
                amount = Math.floor(pot * 0.75); // 跟注+加注到3/4底池 / Call + raise to 3/4 pot
            }
            amount = Math.min(amount, p.stack);
            if (toCall === 0) return { action: 'bet', amount };
            return { action: 'raise', amount };
        }

        case ACTION_BET_POT: {
            let amount;
            if (toCall === 0) {
                amount = pot;
            } else {
                amount = pot + toCall; // 跟注+加注到底池大小
            }
            amount = Math.min(amount, p.stack);
            if (toCall === 0) return { action: 'bet', amount };
            return { action: 'raise', amount };
        }

        case ACTION_BET_ALLIN:
            return { action: 'allin', amount: p.stack + gameState.playerBets[playerId] };

        default:
            return { action: 'fold', amount: 0 };
    }
}

// ============================================================================
// 信息集编码 / Information Set Encoding
// ============================================================================

/**
 * 编码信息集为字符串键 / Encode information set as string key
 * 信息集 = (手牌桶, 阶段, 公共牌特征, 行动历史)
 * Information set = (hand bucket, phase, board features, action history)
 *
 * @param {string[]} holeCards
 * @param {string[]} communityCards
 * @param {string} phase
 * @param {Array} actionHistory - 本轮行动历史
 * @param {number} playerId
 * @returns {string}
 */
function encodeInformationSet(holeCards, communityCards, phase, actionHistory, playerId) {
    const bucket = classifyHandBucket(holeCards, communityCards);
    const boardKey = encodeBoard(communityCards);
    const actionKey = actionHistory.map(a => a.action[0]).join('');

    return `${playerId}|${phase}|b${bucket}|${boardKey}|${actionKey}`;
}

/**
 * 编码公共牌特征 / Encode board features
 * @param {string[]} communityCards
 * @returns {string}
 */
function encodeBoard(communityCards) {
    if (communityCards.length === 0) return 'pre';

    // 提取公共牌特征: 同花可能、顺子可能、对子 / Board features: flush possible, straight possible, paired
    const ranks = communityCards.map(c => '23456789TJQKA'.indexOf(c[0]));
    const suits = communityCards.map(c => c[1]);

    // 检测同花可能 / Flush possible?
    const suitCounts = {};
    for (const s of suits) suitCounts[s] = (suitCounts[s] || 0) + 1;
    const maxSuit = Math.max(...Object.values(suitCounts));
    const flushPossible = maxSuit >= 3 ? 'F' : 'f';

    // 检测对子面 / Paired board?
    const rankCounts = {};
    for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
    const paired = Object.values(rankCounts).some(c => c >= 2) ? 'P' : 'p';

    // 检测顺子可能 / Straight possible?
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
    let straightPossible = 's';
    if (uniqueRanks.length >= 3) {
        for (let i = 0; i <= uniqueRanks.length - 3; i++) {
            if (uniqueRanks[i + 2] - uniqueRanks[i] <= 4) {
                straightPossible = 'S';
                break;
            }
        }
    }

    // 牌面湿润度: 高牌数量 / Wetness: number of high cards
    const highCards = ranks.filter(r => r >= 10).length;

    return `${communityCards.length}${flushPossible}${paired}${straightPossible}h${highCards}`;
}

/**
 * 简化的翻前信息集 (不需要公共牌) / Simplified preflop info set
 * @param {string[]} holeCards
 * @param {Array} actionHistory
 * @param {number} playerId
 * @returns {string}
 */
function encodePreflopInfoSet(holeCards, actionHistory, playerId) {
    const bucket = classifyPreflopHand(holeCards);
    const actionKey = actionHistory.map(a => a.action[0]).join('');
    return `p${playerId}|b${bucket}|${actionKey}`;
}

export {
    HAND_BUCKETS, BUCKET_NAMES,
    ACTION_FOLD, ACTION_CHECK_CALL, ACTION_BET_HALF, ACTION_BET_POT, ACTION_BET_ALLIN,
    ACTION_NAMES,
    classifyHandBucket, classifyPreflopHand,
    getAbstractActions, abstractToConcrete,
    encodeInformationSet, encodeBoard, encodePreflopInfoSet
};
