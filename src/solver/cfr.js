/**
 * ============================================================================
 * cfr.js - 反事实遗憾最小化算法 / Counterfactual Regret Minimization (CFR)
 * ============================================================================
 * 实现MCCFR (Monte Carlo CFR) 变体，用于求解近似纳什均衡策略
 * Implements MCCFR variant for computing approximate Nash equilibrium strategies
 *
 * 算法核心 / Algorithm Core:
 * 1. 对每个信息集 I，维护累计遗憾值 regretSum[I][a]
 *    For each information set I, maintain cumulative regrets
 * 2. 通过Regret Matching计算当前策略: π(a) ∝ max(0, R(a))
 *    Current strategy via Regret Matching
 * 3. 采样游戏轨迹，计算反事实值并更新遗憾
 *    Sample trajectories, compute counterfactual values, update regrets
 * 4. 平均策略收敛到纳什均衡
 *    Average strategy converges to Nash equilibrium
 */

import {
    ACTION_FOLD, ACTION_CHECK_CALL, ACTION_BET_HALF, ACTION_BET_POT, ACTION_BET_ALLIN,
    ACTION_NAMES, getAbstractActions, abstractToConcrete,
    encodeInformationSet, encodePreflopInfoSet, classifyPreflopHand, classifyHandBucket
} from './abstraction.js';

import {
    createGameState, startNewHand, getAvailableActions, executeAction,
    PHASE_PREFLOP, PHASE_FLOP, PHASE_TURN, PHASE_RIVER, PHASE_ENDED,
    ACTION_FOLD as GAME_FOLD, ACTION_CHECK as GAME_CHECK, ACTION_CALL as GAME_CALL,
    ACTION_BET as GAME_BET, ACTION_RAISE as GAME_RAISE, ACTION_ALL_IN as GAME_ALLIN
} from '../engine/game.js';

import { calculateEquity, compareHands } from '../engine/evaluator.js';

// ============================================================================
// CFR 策略表 / CFR Strategy Tables
// ============================================================================

class CFRAgent {
    /**
     * @param {Object} config - 配置 / Configuration
     * @param {number} config.numActions - 动作数量 / Number of actions
     * @param {number} config.regretFloor - 遗憾值下限 (防止负值累积) / Regret floor
     */
    constructor(config = {}) {
        this.numActions = config.numActions || 5;
        this.regretFloor = config.regretFloor || 0;

        // 累计遗憾表: Map<infoSetKey, Float64Array(actions)>
        // Cumulative regret table
        this.regretSum = new Map();

        // 累计策略表 (用于计算平均策略)
        // Cumulative strategy table (for average strategy)
        this.strategySum = new Map();

        // 当前平均策略缓存
        // Average strategy cache
        this.averageStrategy = new Map();

        // 迭代计数
        // Iteration count
        this.iterations = 0;
    }

    /**
     * 获取信息集的遗憾向量 / Get regret vector for information set
     * @param {string} infoSetKey
     * @returns {Float64Array}
     */
    getRegretSum(infoSetKey) {
        if (!this.regretSum.has(infoSetKey)) {
            this.regretSum.set(infoSetKey, new Float64Array(this.numActions));
        }
        return this.regretSum.get(infoSetKey);
    }

    /**
     * 获取信息集的累计策略 / Get strategy sum for information set
     * @param {string} infoSetKey
     * @returns {Float64Array}
     */
    getStrategySum(infoSetKey) {
        if (!this.strategySum.has(infoSetKey)) {
            this.strategySum.set(infoSetKey, new Float64Array(this.numActions));
        }
        return this.strategySum.get(infoSetKey);
    }

    /**
     * Regret Matching - 根据遗憾值计算策略
     * @param {Float64Array} regrets
     * @returns {Float64Array} 策略概率分布 / Strategy probability distribution
     */
    regretMatching(regrets) {
        const strategy = new Float64Array(this.numActions);
        let normalizingSum = 0;

        for (let a = 0; a < this.numActions; a++) {
            strategy[a] = Math.max(regrets[a], this.regretFloor);
            normalizingSum += strategy[a];
        }

        if (normalizingSum > 0) {
            for (let a = 0; a < this.numActions; a++) {
                strategy[a] /= normalizingSum;
            }
        } else {
            //  uniform random if all regrets are non-positive
            const uniform = 1.0 / this.numActions;
            for (let a = 0; a < this.numActions; a++) {
                strategy[a] = uniform;
            }
        }

        return strategy;
    }

    /**
     * 获取当前策略 / Get current strategy
     * @param {string} infoSetKey
     * @returns {Float64Array}
     */
    getStrategy(infoSetKey) {
        const regrets = this.getRegretSum(infoSetKey);
        return this.regretMatching(regrets);
    }

    /**
     * 获取平均策略 (收敛后的GTO近似) / Get average strategy (GTO approximation)
     * @param {string} infoSetKey
     * @returns {Float64Array}
     */
    getAverageStrategy(infoSetKey) {
        if (this.averageStrategy.has(infoSetKey)) {
            return this.averageStrategy.get(infoSetKey);
        }

        const stratSum = this.getStrategySum(infoSetKey);
        const avgStrat = new Float64Array(this.numActions);
        let normalizingSum = 0;

        for (let a = 0; a < this.numActions; a++) {
            normalizingSum += stratSum[a];
        }

        if (normalizingSum > 0) {
            for (let a = 0; a < this.numActions; a++) {
                avgStrat[a] = stratSum[a] / normalizingSum;
            }
        } else {
            const uniform = 1.0 / this.numActions;
            for (let a = 0; a < this.numActions; a++) {
                avgStrat[a] = uniform;
            }
        }

        this.averageStrategy.set(infoSetKey, avgStrat);
        return avgStrat;
    }

    /**
     * 清空平均策略缓存 / Clear average strategy cache
     */
    clearCache() {
        this.averageStrategy.clear();
    }

    /**
     * 为信息集的策略累加贡献 / Add strategy contribution to info set
     * @param {string} infoSetKey
     * @param {Float64Array} strategy
     * @param {number} reachProb - 到达概率 / Reach probability
     */
    addStrategyContribution(infoSetKey, strategy, reachProb) {
        const stratSum = this.getStrategySum(infoSetKey);
        for (let a = 0; a < this.numActions; a++) {
            stratSum[a] += strategy[a] * reachProb;
        }
    }

    /**
     * 更新遗憾值 / Update regrets
     * @param {string} infoSetKey
     * @param {Float64Array} actionValues - 各动作的反事实值 / Counterfactual values
     * @param {Float64Array} strategy - 当前策略
     * @param {number} opponentReach - 对手到达概率 / Opponent reach probability
     */
    updateRegrets(infoSetKey, actionValues, strategy, opponentReach) {
        const regrets = this.getRegretSum(infoSetKey);

        // 计算当前策略的期望值 / Expected value of current strategy
        let ev = 0;
        for (let a = 0; a < this.numActions; a++) {
            ev += strategy[a] * actionValues[a];
        }

        // 更新遗憾: regret[a] = (value[a] - ev) * opponentReach
        for (let a = 0; a < this.numActions; a++) {
            const regret = (actionValues[a] - ev) * opponentReach;
            regrets[a] += regret;
        }
    }
}

// ============================================================================
// MCCFR 训练器 / MCCFR Trainer
// ============================================================================

class MCCFRTrainer {
    /**
     * @param {Object} config
     * @param {number} config.iterations - 训练迭代次数 / Training iterations
     * @param {number} config.printInterval - 打印间隔 / Print interval
     */
    constructor(config = {}) {
        this.iterations = config.iterations || 50000;
        this.printInterval = config.printInterval || 5000;

        // 两个玩家的CFR智能体 / CFR agents for both players
        this.agents = [
            new CFRAgent({ numActions: 5 }),
            new CFRAgent({ numActions: 5 })
        ];

        // 训练统计 / Training stats
        this.stats = {
            totalHands: 0,
            p1Wins: 0,
            p2Wins: 0,
            ties: 0,
            startTime: null
        };
    }

    /**
     * 运行MCCFR训练 / Run MCCFR training
     * @param {Function} progressCallback - 进度回调 (iteration, total) => void
     */
    train(progressCallback) {
        this.stats.startTime = Date.now();

        for (let i = 0; i < this.iterations; i++) {
            // 外部采样: 遍历每个玩家作为更新目标
            // External sampling: iterate each player as update target
            for (let playerToUpdate = 0; playerToUpdate < 2; playerToUpdate++) {
                this.runExternalSampling(playerToUpdate);
            }

            this.agents[0].iterations++;
            this.agents[1].iterations++;

            if (progressCallback && (i + 1) % this.printInterval === 0) {
                const elapsed = (Date.now() - this.stats.startTime) / 1000;
                progressCallback(i + 1, this.iterations, elapsed);
            }
        }

        // 训练完成后清空缓存 / Clear cache after training
        this.agents[0].clearCache();
        this.agents[1].clearCache();
    }

    /**
     * 外部采样MCCFR单次迭代 / Single external sampling MCCFR iteration
     * @param {number} playerToUpdate - 要更新策略的玩家 / Player to update
     */
    runExternalSampling(playerToUpdate) {
        // 创建新游戏 / Create new game
        let state = createGameState({ bigBlind: 100, smallBlind: 50, stackSize: 10000 });
        state = startNewHand(state, false);

        // 使用外部采样遍历游戏树 / Traverse game tree with external sampling
        this.traverse(state, playerToUpdate, 1.0, 1.0);
    }

    /**
     * 递归遍历游戏树 / Recursively traverse game tree
     * @param {Object} state - 当前游戏状态
     * @param {number} playerToUpdate - 正在更新策略的玩家
     * @param {number} p0Reach - 玩家0的到达概率
     * @param {number} p1Reach - 玩家1的到达概率
     * @returns {number} 当前玩家的效用值 / Utility for current player
     */
    traverse(state, playerToUpdate, p0Reach, p1Reach) {
        // 游戏结束 / Game ended
        if (state.phase === PHASE_ENDED) {
            return this.getPayoff(state, playerToUpdate);
        }

        const currentPlayer = state.currentPlayer;
        const opponent = 1 - currentPlayer;

        // 获取信息集 / Get information set
        const infoSetKey = this.encodeInfoSet(state, currentPlayer);

        // 获取可用动作 / Get available actions
        const availableActions = getAbstractActions(state, currentPlayer);
        if (availableActions.length === 0) {
            // 玩家无法行动 (已全押或不活跃)，前进 / Player cannot act
            const nextState = this.advanceGame(state);
            return this.traverse(nextState, playerToUpdate, p0Reach, p1Reach);
        }

        // 获取当前策略 / Get current strategy
        const strategy = this.agents[currentPlayer].getStrategy(infoSetKey);

        // 采样动作 (外部采样: 对非更新玩家采样单一动作)
        // External sampling: sample single action for non-updating player
        let sampledAction;
        if (currentPlayer === playerToUpdate) {
            // 对更新玩家: 需要遍历所有动作 (简化为采样)
            // For player being updated: sample according to strategy
            sampledAction = this.sampleAction(availableActions, strategy);
        } else {
            // 对对手: 采样单一动作 / For opponent: sample one action
            sampledAction = this.sampleAction(availableActions, strategy);
        }

        // 执行动作 / Execute action
        const concrete = abstractToConcrete(sampledAction, state, currentPlayer);
        const nextState = executeAction(state, concrete.action, concrete.amount);

        // 更新到达概率 / Update reach probabilities
        const actionProb = strategy[sampledAction];
        let newP0Reach = p0Reach;
        let newP1Reach = p1Reach;
        if (currentPlayer === 0) {
            newP0Reach *= actionProb;
        } else {
            newP1Reach *= actionProb;
        }

        // 如果是更新玩家，记录策略贡献 / If updating player, record strategy contribution
        if (currentPlayer === playerToUpdate) {
            const myReach = playerToUpdate === 0 ? p0Reach : p1Reach;
            this.agents[playerToUpdate].addStrategyContribution(infoSetKey, strategy, myReach);
        }

        // 递归获取效用值 / Recursively get utility
        const utility = this.traverse(nextState, playerToUpdate, newP0Reach, newP1Reach);

        // 如果是更新玩家，更新遗憾值 / If updating player, update regrets
        if (currentPlayer === playerToUpdate) {
            const opponentReach = playerToUpdate === 0 ? p1Reach : p0Reach;

            // 计算各动作的假设效用 (简化为相同效用，因为已采样)
            // Compute hypothetical utilities for all actions
            const actionValues = new Float64Array(5);
            for (const a of availableActions) {
                const c = abstractToConcrete(a, state, currentPlayer);
                try {
                    const hypotheticalState = executeAction(state, c.action, c.amount);
                    const hypotheticalUtility = this.traverse(
                        hypotheticalState, playerToUpdate,
                        currentPlayer === 0 ? p0Reach : newP0Reach,
                        currentPlayer === 1 ? p1Reach : newP1Reach
                    );
                    actionValues[a] = hypotheticalUtility;
                } catch (e) {
                    actionValues[a] = -10000; // 非法动作 / Illegal action
                }
            }

            this.agents[playerToUpdate].updateRegrets(infoSetKey, actionValues, strategy, opponentReach);
        }

        return utility;
    }

    /**
     * 编码信息集 / Encode information set
     */
    encodeInfoSet(state, playerId) {
        const player = state.players[playerId];
        const actionHistory = state.streetBets;

        if (state.phase === PHASE_PREFLOP) {
            return encodePreflopInfoSet(player.holeCards, actionHistory, playerId);
        }

        return encodeInformationSet(
            player.holeCards,
            state.communityCards,
            state.phase,
            actionHistory,
            playerId
        );
    }

    /**
     * 根据策略采样动作 / Sample action from strategy
     */
    sampleAction(availableActions, strategy) {
        const r = Math.random();
        let cumProb = 0;

        for (const a of availableActions) {
            cumProb += strategy[a];
            if (r <= cumProb) {
                return a;
            }
        }

        return availableActions[availableActions.length - 1];
    }

    /**
     * 获取收益 / Get payoff
     */
    getPayoff(state, playerId) {
        if (state.winners.length === 0) return 0;

        const winner = state.winners.find(w => w.id === playerId);
        if (winner) {
            // 净收益 = 赢得金额 - 本手牌投入 / Net profit = win amount - investment
            const invested = state.players[playerId].totalInvested;
            const winAmount = winner.winAmount / (state.winners.length === 1 ? 1 : state.winners.length);
            return winAmount - invested;
        }
        return -state.players[playerId].totalInvested;
    }

    /**
     * 前进游戏状态 (处理自动推进) / Advance game state
     */
    advanceGame(state) {
        // 简化: 如果当前玩家不活跃或全押，尝试结束轮次 / Simplified
        try {
            return executeAction(state, GAME_CHECK, 0);
        } catch (e) {
            return state;
        }
    }

    /**
     * 获取策略建议 / Get strategy recommendation
     * @param {Object} state - 游戏状态
     * @param {number} playerId
     * @returns {Object} {actions: [], probabilities: [], infoSet: string}
     */
    getStrategy(state, playerId) {
        const infoSetKey = this.encodeInfoSet(state, playerId);
        const avgStrategy = this.agents[playerId].getAverageStrategy(infoSetKey);
        const availableActions = getAbstractActions(state, playerId);

        const result = [];
        let totalProb = 0;
        for (const a of availableActions) {
            totalProb += avgStrategy[a];
        }

        for (const a of availableActions) {
            const prob = totalProb > 0 ? avgStrategy[a] / totalProb : 1.0 / availableActions.length;
            result.push({
                actionId: a,
                actionName: ACTION_NAMES[a],
                probability: prob,
                concrete: abstractToConcrete(a, state, playerId)
            });
        }

        // 按概率排序 / Sort by probability
        result.sort((a, b) => b.probability - a.probability);

        return {
            infoSet: infoSetKey,
            actions: result,
            bucket: this.getBucketFromInfoSet(infoSetKey)
        };
    }

    /**
     * 从信息集提取桶信息 / Extract bucket from info set
     */
    getBucketFromInfoSet(infoSetKey) {
        const match = infoSetKey.match(/b(\d)/);
        return match ? parseInt(match[1]) : -1;
    }

    /**
     * 导出策略为JSON / Export strategy as JSON
     */
    exportStrategy() {
        const exportData = {
            player0: {},
            player1: {},
            iterations: this.agents[0].iterations,
            timestamp: Date.now()
        };

        for (const [key, stratSum] of this.agents[0].strategySum) {
            exportData.player0[key] = Array.from(this.agents[0].getAverageStrategy(key));
        }
        for (const [key, stratSum] of this.agents[1].strategySum) {
            exportData.player1[key] = Array.from(this.agents[1].getAverageStrategy(key));
        }

        return exportData;
    }

    /**
     * 导入策略 / Import strategy
     */
    importStrategy(data) {
        for (const [key, strat] of Object.entries(data.player0 || {})) {
            this.agents[0].strategySum.set(key, new Float64Array(strat));
            this.agents[0].averageStrategy.set(key, new Float64Array(strat));
        }
        for (const [key, strat] of Object.entries(data.player1 || {})) {
            this.agents[1].strategySum.set(key, new Float64Array(strat));
            this.agents[1].averageStrategy.set(key, new Float64Array(strat));
        }
    }
}

// ============================================================================
// 理论GTO计算器 (基于数学公式) / Theoretical GTO Calculator
// ============================================================================

class GTOCalculator {
    /**
     * 基于理论公式计算GTO建议 / Calculate GTO advice based on theory
     * @param {Object} state - 游戏状态
     * @param {number} playerId
     * @param {Object} options - 手牌权益等信息 / Hand equity etc.
     * @returns {Object} GTO建议
     */
    static calculateAdvice(state, playerId, options = {}) {
        const p = state.players[playerId];
        const toCall = state.currentBet - state.playerBets[playerId];
        const pot = state.mainPot + state.playerBets[0] + state.playerBets[1];
        const stack = p.stack;
        const equity = options.equity || 0.5; // 手牌胜率 / Hand equity
        const phase = state.phase;

        const advice = {
            infoSet: `${phase}|p${playerId}`,
            actions: [],
            theory: {}
        };

        // 计算理论值 / Calculate theoretical values
        const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
        const mdf = toCall > 0 ? pot / (pot + toCall) : 1.0;
        const evCall = toCall > 0 ? equity * (pot + toCall) - (1 - equity) * toCall : 0;
        const evBet = equity * (pot + Math.min(pot, stack)) - (1 - equity) * Math.min(pot, stack);

        advice.theory = {
            potOdds,
            mdf,
            evCall,
            evBet,
            equity,
            pot,
            toCall,
            stack
        };

        // 可用动作 / Available actions
        const available = getAbstractActions(state, playerId);

        // 基于理论计算各动作频率 / Calculate action frequencies based on theory
        for (const a of available) {
            let prob = 0;
            let reason = '';

            switch (a) {
                case ACTION_FOLD:
                    if (toCall === 0) {
                        prob = 0; // 不应该在可以免费看牌时弃牌
                        reason = 'Never fold when checking is free / 免费看牌时不应弃牌';
                    } else {
                        // 如果权益远低于底池赔率，高频率弃牌
                        // Fold more when equity is far below pot odds
                        prob = Math.max(0, 1 - equity / Math.max(potOdds, 0.01));
                        if (equity > potOdds) {
                            prob = Math.max(0, prob - 0.3); // 即使权益足够，也保留一些弃牌频率进行平衡
                        }
                        reason = `Fold frequency based on equity(${equity.toFixed(2)}) vs pot odds(${potOdds.toFixed(2)}) / 基于权益vs底池赔率的弃牌频率`;
                    }
                    break;

                case ACTION_CHECK_CALL:
                    if (toCall === 0) {
                        // 过牌频率 / Check frequency
                        // 强牌有时过牌设陷阱，弱牌常过牌
                        prob = 0.4 + (1 - equity) * 0.4;
                        reason = 'Check frequency balances trapping and pot control / 过牌频率平衡陷阱和底池控制';
                    } else {
                        // 跟注频率基于MDF和权益 / Call frequency based on MDF and equity
                        const mdfCall = Math.min(1.0, equity / Math.max(potOdds, 0.01));
                        // GTO要求至少达到MDF防守
                        prob = Math.max(mdf, mdfCall * 0.8);
                        prob = Math.min(1.0, prob);
                        reason = `Call frequency = max(MDF, equity/potOdds) / 跟注频率 = max(最小防守频率, 权益/赔率)`;
                    }
                    break;

                case ACTION_BET_HALF:
                    // 半池下注用于价值下注和诈唬的平衡
                    // Half pot for balanced value/bluff
                    if (equity > 0.6) {
                        prob = (equity - 0.5) * 1.5; // 价值下注 / Value bet
                        reason = 'Value bet with strong equity / 强牌价值下注';
                    } else if (equity < 0.3 && toCall === 0) {
                        prob = (0.35 - equity) * 1.0; // 诈唬 / Bluff
                        reason = 'Bluff with weak equity / 弱牌诈唬';
                    } else {
                        prob = 0.1; // 中等牌偶尔下注 / Medium hands occasional bet
                        reason = 'Occasional bet for balance / 平衡性偶尔下注';
                    }
                    break;

                case ACTION_BET_POT:
                    // 满池下注通常是强牌或强听牌
                    // Pot bet usually strong made hands or strong draws
                    if (equity > 0.75) {
                        prob = (equity - 0.6) * 1.2;
                        reason = 'Strong value bet / 强价值下注';
                    } else if (equity < 0.2 && toCall === 0) {
                        prob = 0.15; // 偶尔的满池诈唬 / Occasional pot bluff
                        reason = 'Occasional pot bluff for balance / 偶尔满池诈唬平衡';
                    } else {
                        prob = 0.05;
                        reason = 'Rare pot bet with medium strength / 中等牌极少满池下注';
                    }
                    break;

                case ACTION_BET_ALLIN:
                    // 全押决策基于筹码深度和权益
                    // All-in based on SPR and equity
                    const spr = stack / pot;
                    if (equity > 0.8 && spr < 3) {
                        prob = 0.6;
                        reason = 'All-in with nuts and low SPR / 低筹码深度时的坚果全押';
                    } else if (equity > 0.65 && spr < 1.5) {
                        prob = 0.4;
                        reason = 'All-in with strong equity and short stack / 短码强牌全押';
                    } else if (equity < 0.15 && spr < 1 && toCall === 0) {
                        prob = 0.1; // 绝望式全押诈唬 / Desperation all-in bluff
                        reason = 'Desperation bluff with very low stack / 极低筹码的绝望诈唬';
                    } else {
                        prob = 0.02;
                        reason = 'Rare all-in / 极少全押';
                    }
                    break;
            }

            prob = Math.max(0, Math.min(1, prob));

            advice.actions.push({
                actionId: a,
                actionName: ACTION_NAMES[a],
                probability: prob,
                reason,
                concrete: abstractToConcrete(a, state, playerId)
            });
        }

        // 归一化概率 / Normalize probabilities
        let totalProb = advice.actions.reduce((sum, a) => sum + a.probability, 0);
        if (totalProb > 0) {
            advice.actions.forEach(a => a.probability /= totalProb);
        } else {
            // 均匀分布 / Uniform
            advice.actions.forEach(a => a.probability = 1.0 / advice.actions.length);
        }

        advice.actions.sort((a, b) => b.probability - a.probability);

        return advice;
    }
}

export {
    CFRAgent,
    MCCFRTrainer,
    GTOCalculator,
    ACTION_FOLD, ACTION_CHECK_CALL, ACTION_BET_HALF, ACTION_BET_POT, ACTION_BET_ALLIN,
    ACTION_NAMES
};
