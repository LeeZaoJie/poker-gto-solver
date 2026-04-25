/**
 * ============================================================================
 * evaluator.js - 扑克牌力评估模块 / Hand Strength Evaluator Module
 * ============================================================================
 * 基于7张牌选出最佳5张牌组合，返回可比较的牌力值
 * Evaluates the best 5-card hand from 7 cards and returns a comparable strength value
 *
 * 牌型等级 (Hand Rankings) - 从高到低:
 * 9: 同花大顺/同花顺 (Straight Flush)
 * 8: 四条 (Four of a Kind)
 * 7: 葫芦 (Full House)
 * 6: 同花 (Flush)
 * 5: 顺子 (Straight)
 * 4: 三条 (Three of a Kind)
 * 3: 两对 (Two Pair)
 * 2: 一对 (One Pair)
 * 1: 高牌 (High Card)
 */

import { cardRank, cardSuit, RANK_A, RANK_T } from './cards.js';

/** 牌型常量 / Hand type constants */
const HAND_HIGH_CARD = 1;
const HAND_ONE_PAIR = 2;
const HAND_TWO_PAIR = 3;
const HAND_THREE_KIND = 4;
const HAND_STRAIGHT = 5;
const HAND_FLUSH = 6;
const HAND_FULL_HOUSE = 7;
const HAND_FOUR_KIND = 8;
const HAND_STRAIGHT_FLUSH = 9;

/**
 * 评估5张牌的牌力值 / Evaluate 5-card hand strength
 * @param {string[]} fiveCards - 5张牌 / 5 cards
 * @returns {number} 牌力值，越大越强 / Strength value, higher is better
 *
 * 编码方式 / Encoding:
 * bits 20-23: 牌型等级 / hand type (1-9)
 * bits 16-19: 主牌踢脚 / primary kicker
 * bits 12-15: 次牌踢脚 / secondary kicker
 * bits 0-11: 其余踢脚 / remaining kickers
 */
function evaluateFiveCardHand(fiveCards) {
    // 提取数值和花色 / Extract ranks and suits
    const ranks = fiveCards.map(c => cardRank(c)).sort((a, b) => b - a);
    const suits = fiveCards.map(c => cardSuit(c));

    // 统计各数值出现次数 / Count rank frequencies
    const rankCounts = new Map();
    for (const r of ranks) {
        rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
    }

    // 按出现次数和数值排序 / Sort by frequency then rank
    const sortedEntries = [...rankCounts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return b[0] - a[0];
    });

    const isFlush = suits.every(s => s === suits[0]);

    // 检查顺子 / Check straight
    let isStraight = true;
    for (let i = 0; i < 4; i++) {
        if (ranks[i] - ranks[i + 1] !== 1) {
            isStraight = false;
            break;
        }
    }
    // 特殊顺子: A-5-4-3-2 (wheel) / Special straight: A-5-4-3-2
    let wheel = false;
    if (!isStraight && ranks[0] === RANK_A && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
        isStraight = true;
        wheel = true;
    }

    // 同花顺 / Straight Flush
    if (isFlush && isStraight) {
        const highCard = wheel ? 3 : ranks[0]; // wheel以5为高点
        return encodeHand(HAND_STRAIGHT_FLUSH, [highCard]);
    }

    // 四条 / Four of a Kind
    if (sortedEntries[0][1] === 4) {
        const quadRank = sortedEntries[0][0];
        const kicker = sortedEntries[1][0];
        return encodeHand(HAND_FOUR_KIND, [quadRank, kicker]);
    }

    // 葫芦 / Full House
    if (sortedEntries[0][1] === 3 && sortedEntries[1][1] >= 2) {
        const tripRank = sortedEntries[0][0];
        const pairRank = sortedEntries[1][0];
        return encodeHand(HAND_FULL_HOUSE, [tripRank, pairRank]);
    }

    // 同花 / Flush
    if (isFlush) {
        return encodeHand(HAND_FLUSH, ranks);
    }

    // 顺子 / Straight
    if (isStraight) {
        const highCard = wheel ? 3 : ranks[0];
        return encodeHand(HAND_STRAIGHT, [highCard]);
    }

    // 三条 / Three of a Kind
    if (sortedEntries[0][1] === 3) {
        const tripRank = sortedEntries[0][0];
        const kickers = [sortedEntries[1][0], sortedEntries[2][0]];
        return encodeHand(HAND_THREE_KIND, [tripRank, ...kickers]);
    }

    // 两对 / Two Pair
    if (sortedEntries[0][1] === 2 && sortedEntries[1][1] === 2) {
        const pair1 = sortedEntries[0][0];
        const pair2 = sortedEntries[1][0];
        const kicker = sortedEntries[2][0];
        return encodeHand(HAND_TWO_PAIR, [pair1, pair2, kicker]);
    }

    // 一对 / One Pair
    if (sortedEntries[0][1] === 2) {
        const pairRank = sortedEntries[0][0];
        const kickers = [sortedEntries[1][0], sortedEntries[2][0], sortedEntries[3][0]];
        return encodeHand(HAND_ONE_PAIR, [pairRank, ...kickers]);
    }

    // 高牌 / High Card
    return encodeHand(HAND_HIGH_CARD, ranks);
}

/**
 * 将牌型编码为可比较的整数 / Encode hand type and kickers into comparable integer
 */
function encodeHand(handType, kickers) {
    let value = handType << 20;
    for (let i = 0; i < kickers.length; i++) {
        value |= kickers[i] << (16 - i * 4);
    }
    return value;
}

/**
 * 从7张牌中找出最佳5张牌型 / Find best 5-card hand from 7 cards
 * @param {string[]} sevenCards - 7张牌 (2张手牌+5张公共牌) / 7 cards (2 hole + 5 community)
 * @returns {Object} {strength: number, bestHand: string[], handType: string}
 */
function evaluateSevenCardHand(sevenCards) {
    // 生成所有C(7,5)=21种组合 / Generate all 21 combinations
    const combos = generateCombinations(sevenCards, 5);
    let bestStrength = -1;
    let bestHand = null;

    for (const five of combos) {
        const strength = evaluateFiveCardHand(five);
        if (strength > bestStrength) {
            bestStrength = strength;
            bestHand = five;
        }
    }

    return {
        strength: bestStrength,
        bestHand: bestHand,
        handType: getHandTypeName(bestStrength >>> 20)
    };
}

/**
 * 生成组合 (辅助函数) / Generate combinations helper
 */
function generateCombinations(arr, k) {
    const result = [];
    function backtrack(start, path) {
        if (path.length === k) {
            result.push([...path]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            path.push(arr[i]);
            backtrack(i + 1, path);
            path.pop();
        }
    }
    backtrack(0, []);
    return result;
}

/**
 * 根据牌力值获取牌型名称 / Get hand type name from strength value
 * @param {number} type - 牌型等级 (1-9)
 * @returns {string} 中文/英文名称
 */
function getHandTypeName(type) {
    const names = {
        1: '高牌 High Card',
        2: '一对 One Pair',
        3: '两对 Two Pair',
        4: '三条 Three of a Kind',
        5: '顺子 Straight',
        6: '同花 Flush',
        7: '葫芦 Full House',
        8: '四条 Four of a Kind',
        9: '同花顺 Straight Flush'
    };
    return names[type] || '未知 Unknown';
}

/**
 * 比较两手7张牌的胜负 / Compare two 7-card hands
 * @param {string[]} hand1 - 7张牌
 * @param {string[]} hand2 - 7张牌
 * @returns {number} 1: hand1胜, -1: hand2胜, 0: 平局
 */
function compareHands(hand1, hand2) {
    const eval1 = evaluateSevenCardHand(hand1);
    const eval2 = evaluateSevenCardHand(hand2);
    if (eval1.strength > eval2.strength) return 1;
    if (eval1.strength < eval2.strength) return -1;
    return 0;
}

/**
 * 计算手牌在翻前的胜率 (蒙特卡洛模拟) / Calculate preflop equity via Monte Carlo
 * @param {string[]} holeCards1 - 玩家1手牌 / Player 1 hole cards
 * @param {string[]} holeCards2 - 玩家2手牌 / Player 2 hole cards
 * @param {string[]} community - 已知公共牌 (可选) / Known community cards (optional)
 * @param {number} trials - 模拟次数 / Number of trials
 * @returns {Object} {p1Win, p2Win, tie} 概率 / Probabilities
 */
function calculateEquity(holeCards1, holeCards2, community = [], trials = 2000) {
    const allCards = [...holeCards1, ...holeCards2, ...community];
    const remainingDeck = [];

    // 构建剩余牌组 / Build remaining deck
    const allSuits = ['s', 'h', 'd', 'c'];
    const allRanks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    for (const s of allSuits) {
        for (const r of allRanks) {
            const card = r + s;
            if (!allCards.includes(card)) {
                remainingDeck.push(card);
            }
        }
    }

    let p1Wins = 0, p2Wins = 0, ties = 0;

    for (let t = 0; t < trials; t++) {
        // 洗牌并补足公共牌 / Shuffle and fill community cards
        const shuffled = [...remainingDeck];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const needCards = 5 - community.length;
        const fullCommunity = [...community, ...shuffled.slice(0, needCards)];

        const fullHand1 = [...holeCards1, ...fullCommunity];
        const fullHand2 = [...holeCards2, ...fullCommunity];

        const result = compareHands(fullHand1, fullHand2);
        if (result > 0) p1Wins++;
        else if (result < 0) p2Wins++;
        else ties++;
    }

    return {
        p1Win: p1Wins / trials,
        p2Win: p2Wins / trials,
        tie: ties / trials
    };
}

export {
    evaluateFiveCardHand,
    evaluateSevenCardHand,
    compareHands,
    calculateEquity,
    getHandTypeName,
    HAND_HIGH_CARD, HAND_ONE_PAIR, HAND_TWO_PAIR, HAND_THREE_KIND,
    HAND_STRAIGHT, HAND_FLUSH, HAND_FULL_HOUSE, HAND_FOUR_KIND, HAND_STRAIGHT_FLUSH
};
