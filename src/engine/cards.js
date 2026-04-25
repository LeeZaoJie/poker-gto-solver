/**
 * ============================================================================
 * cards.js - 扑克牌组管理模块 / Deck & Card Management Module
 * ============================================================================
 * 提供标准的52张扑克牌表示、洗牌、发牌功能
 * Provides standard 52-card deck representation, shuffling, and dealing
 */

// 牌面数值定义 / Card rank definitions
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c']; // spades, hearts, diamonds, clubs / 黑桃、红桃、方块、梅花

// 数值常量 / Numeric constants
const RANK_2 = 0, RANK_3 = 1, RANK_4 = 2, RANK_5 = 3, RANK_6 = 4;
const RANK_7 = 5, RANK_8 = 6, RANK_9 = 7, RANK_T = 8, RANK_J = 9;
const RANK_Q = 10, RANK_K = 11, RANK_A = 12;

const SUIT_SPADE = 0, SUIT_HEART = 1, SUIT_DIAMOND = 2, SUIT_CLUB = 3;

/**
 * 创建一副标准52张牌 / Create a standard 52-card deck
 * @returns {string[]} 牌面字符串数组 (e.g., "As", "Th", "2d")
 */
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(rank + suit);
        }
    }
    return deck;
}

/**
 * Fisher-Yates 洗牌算法 / Fisher-Yates shuffle algorithm
 * @param {string[]} deck - 牌组数组 / Deck array
 * @returns {string[]} 洗好的牌组 / Shuffled deck
 */
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * 将牌面字符串转为数值ID (0-51) / Convert card string to numeric ID
 * @param {string} card - 如 "As" / e.g., "As"
 * @returns {number} 0-51
 */
function cardToId(card) {
    const rank = RANKS.indexOf(card[0]);
    const suit = SUITS.indexOf(card[1]);
    return rank * 4 + suit;
}

/**
 * 将数值ID转回牌面字符串 / Convert numeric ID back to card string
 * @param {number} id - 0-51
 * @returns {string} 如 "As" / e.g., "As"
 */
function idToCard(id) {
    const rank = Math.floor(id / 4);
    const suit = id % 4;
    return RANKS[rank] + SUITS[suit];
}

/**
 * 获取牌的数值 (2=0, ..., A=12) / Get card rank value
 * @param {string} card
 * @returns {number}
 */
function cardRank(card) {
    return RANKS.indexOf(card[0]);
}

/**
 * 获取牌的花色 / Get card suit
 * @param {string} card
 * @returns {number} 0-3
 */
function cardSuit(card) {
    return SUITS.indexOf(card[1]);
}

/**
 * 将手牌表示为字符串 / Format hand for display
 * @param {string[]} cards
 * @returns {string}
 */
function formatHand(cards) {
    return cards.join(' ');
}

/**
 * 生成所有C(n,k)组合 / Generate all combinations of k items from array
 * @param {Array} arr
 * @param {number} k
 * @returns {Array[]}
 */
function combinations(arr, k) {
    const result = [];
    function helper(start, current) {
        if (current.length === k) {
            result.push([...current]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            current.push(arr[i]);
            helper(i + 1, current);
            current.pop();
        }
    }
    helper(0, []);
    return result;
}

export {
    RANKS, SUITS,
    RANK_2, RANK_3, RANK_4, RANK_5, RANK_6, RANK_7, RANK_8, RANK_9, RANK_T,
    RANK_J, RANK_Q, RANK_K, RANK_A,
    SUIT_SPADE, SUIT_HEART, SUIT_DIAMOND, SUIT_CLUB,
    createDeck, shuffleDeck, cardToId, idToCard,
    cardRank, cardSuit, formatHand, combinations
};
