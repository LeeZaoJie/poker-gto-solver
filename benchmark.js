/**
 * benchmark.js - 性能基准测试 / Performance Benchmarks
 * 对比核心操作的执行速度，量化优化效果
 */

import { createGameState, startNewHand, executeAction, ACTION_CALL, ACTION_CHECK, cloneState } from './src/engine/game.js';
import { evaluateSevenCardHand, calculateEquity } from './src/engine/evaluator.js';

function benchmark(name, fn, iterations = 10000) {
    // 预热 / Warmup
    for (let i = 0; i < Math.min(iterations, 100); i++) fn();

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        fn();
    }
    const elapsed = performance.now() - start;
    const opsPerSec = (iterations / (elapsed / 1000)).toFixed(0);
    console.log(`  ${name}: ${elapsed.toFixed(2)}ms (${opsPerSec} ops/sec)`);
}

console.log('\n========== Performance Benchmarks / 性能基准测试 ==========\n');

// 1. cloneState性能 / cloneState performance
console.log('1. Game State Cloning / 游戏状态克隆:');
const testState = startNewHand(createGameState(), false);
benchmark('cloneState (optimized)    ', () => cloneState(testState), 50000);

// 对比JSON方法 / Compare JSON method
function jsonClone(state) { return JSON.parse(JSON.stringify(state)); }
benchmark('cloneState (JSON fallback)', () => jsonClone(testState), 50000);

// 2. 牌力评估性能 / Hand evaluation performance
console.log('\n2. Hand Evaluation / 牌力评估:');
const testHand7 = ['As', 'Ks', 'Qs', 'Js', 'Ts', '9s', '8s'];
const testHand5 = ['As', 'Ks', 'Qs', 'Js', 'Ts'];
benchmark('evaluateSevenCardHand (7 cards)   ', () => evaluateSevenCardHand(testHand7), 20000);
benchmark('evaluateSevenCardHand (5 cards)   ', () => evaluateSevenCardHand(testHand5), 20000);

// 3. 游戏流程性能 / Game flow performance
console.log('\n3. Full Hand Simulation / 完整手牌模拟:');
benchmark('Complete hand (call-call-check)', () => {
    let state = startNewHand(createGameState(), false);
    state = executeAction(state, ACTION_CALL, 0);
    state = executeAction(state, ACTION_CHECK, 0);
    // Flop
    state = executeAction(state, ACTION_CHECK, 0);
    state = executeAction(state, ACTION_CHECK, 0);
    // Turn
    state = executeAction(state, ACTION_CHECK, 0);
    state = executeAction(state, ACTION_CHECK, 0);
    // River
    state = executeAction(state, ACTION_CHECK, 0);
    state = executeAction(state, ACTION_CHECK, 0);
}, 5000);

// 4. 胜率计算性能 / Equity calculation performance
console.log('\n4. Equity Calculation / 胜率计算:');
const hole1 = ['As', 'Ac'];
const hole2 = ['Ks', 'Qs'];
benchmark('calculateEquity (100 trials) ', () => calculateEquity(hole1, hole2, [], 100), 500);
benchmark('calculateEquity (500 trials) ', () => calculateEquity(hole1, hole2, [], 500), 100);

console.log('\n========== Benchmark Complete / 基准测试完成 ==========\n');
