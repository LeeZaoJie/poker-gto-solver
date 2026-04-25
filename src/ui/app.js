/**
 * ============================================================================
 * app.js - 德州扑克GTO求解器主应用 / Main Application
 * ============================================================================
 * 连接游戏引擎、CFR求解器与HTML界面
 * Connects game engine, CFR solver, and HTML UI
 */

import {
    createGameState, startNewHand, getAvailableActions, executeAction,
    getTotalPot, getAmountToCall, getPotOdds, getMDF,
    ACTION_FOLD, ACTION_CHECK, ACTION_CALL, ACTION_BET, ACTION_RAISE, ACTION_ALL_IN,
    PHASE_PREFLOP, PHASE_FLOP, PHASE_TURN, PHASE_RIVER, PHASE_SHOWDOWN, PHASE_ENDED
} from '../engine/game.js';

import { evaluateSevenCardHand, calculateEquity } from '../engine/evaluator.js';

import {
    ACTION_FOLD as ABS_FOLD, ACTION_CHECK_CALL, ACTION_BET_HALF, ACTION_BET_POT, ACTION_BET_ALLIN,
    ACTION_NAMES, getAbstractActions, abstractToConcrete
} from '../solver/abstraction.js';

import { GTOCalculator, MCCFRTrainer } from '../solver/cfr.js';

// ============================================================================
// 模块级缓存 / Module-level caches
// ============================================================================

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_INDEX = '23456789TJQKA';

// ============================================================================
// 全局状态 / Global State
// ============================================================================

let gameState = null;
let cfrTrainer = null;
let gameMode = 'human'; // 'human' or 'ai-vs-ai'
let showGTO = true;
let revealAllCards = false;
let isAnimating = false;
let humanPlayerId = 0; // 人类始终是Player 1 (BTN)

// ============================================================================
// DOM 元素引用 / DOM Element References
// ============================================================================

const els = {
    // 玩家元素 / Player elements
    playerPositions: [document.getElementById('player-0'), document.getElementById('player-1')],
    playerCards: [document.getElementById('cards-0'), document.getElementById('cards-1')],
    playerStacks: [document.getElementById('stack-0'), document.getElementById('stack-1')],
    playerBets: [document.getElementById('bet-0'), document.getElementById('bet-1')],
    playerStatus: [document.getElementById('status-0'), document.getElementById('status-1')],
    dealerBtns: [document.getElementById('dealer-0'), document.getElementById('dealer-1')],

    // 公共元素 / Community elements
    communityCards: document.getElementById('community-cards'),
    potAmount: document.getElementById('pot-amount'),
    phaseIndicator: document.getElementById('phase-indicator'),

    // 控制元素 / Control elements
    actionPanel: document.getElementById('action-panel'),
    actionButtons: document.getElementById('action-buttons'),
    actionText: document.getElementById('action-text'),
    callAmount: document.getElementById('call-amount'),

    // 信息面板 / Info panels
    handNumber: document.getElementById('hand-number'),
    currentBet: document.getElementById('current-bet'),
    toCall: document.getElementById('to-call'),
    potOdds: document.getElementById('pot-odds'),
    mdf: document.getElementById('mdf'),

    // GTO面板 / GTO panel
    gtoPanel: document.getElementById('gto-panel'),
    gtoInfoSet: document.getElementById('gto-info-set'),
    gtoActions: document.getElementById('gto-actions'),
    gtoTheory: document.getElementById('gto-theory'),

    // 历史 / History
    historyList: document.getElementById('history-list'),

    // 弹窗 / Modal
    resultModal: document.getElementById('result-modal'),
    resultTitle: document.getElementById('result-title'),
    resultDetails: document.getElementById('result-details'),

    // 训练 / Training
    trainingProgress: document.getElementById('training-progress'),

    // 按钮 / Buttons
    btnNewHand: document.getElementById('btn-new-hand'),
    btnRandomSim: document.getElementById('btn-random-sim'),
    btnRevealAll: document.getElementById('btn-reveal-all'),
    btnTrain: document.getElementById('btn-train'),
    btnExport: document.getElementById('btn-export'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    toggleGTO: document.getElementById('toggle-gto'),
    gameModeRadios: document.querySelectorAll('input[name="game-mode"]')
};

// ============================================================================
// 初始化 / Initialization
// ============================================================================

function init() {
    // 绑定事件 / Bind events
    els.btnNewHand.addEventListener('click', startNewGame);
    els.btnRandomSim.addEventListener('click', runRandomSimulation);
    els.btnRevealAll.addEventListener('click', () => {
        revealAllCards = !revealAllCards;
        render();
    });
    els.btnCloseModal.addEventListener('click', () => {
        els.resultModal.classList.remove('active');
    });
    els.toggleGTO.addEventListener('change', (e) => {
        showGTO = e.target.checked;
        els.gtoPanel.style.display = showGTO ? 'block' : 'none';
        render();
    });

    els.gameModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            gameMode = e.target.value;
            if (gameState && !gameState.isHandComplete) {
                startNewGame();
            }
        });
    });

    els.btnTrain.addEventListener('click', trainCFR);
    els.btnExport.addEventListener('click', exportStrategy);

    // 使用事件委托绑定行动按钮，避免内存泄漏 / Event delegation for action buttons
    els.actionButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        let amount = 0;
        if (action === ACTION_BET || action === ACTION_RAISE) {
            amount = promptBetAmount(action);
        }
        handlePlayerAction(action, amount);
    });

    // 初始化GTO面板显示 / Init GTO panel visibility
    els.gtoPanel.style.display = showGTO ? 'block' : 'none';

    // 开始第一手牌 / Start first hand
    startNewGame();
}

// ============================================================================
// 游戏控制 / Game Control
// ============================================================================

function startNewGame() {
    if (!gameState) {
        gameState = createGameState({ bigBlind: 100, smallBlind: 50, stackSize: 10000 });
    }
    gameState = startNewHand(gameState, true);
    revealAllCards = false;
    render();
    checkAutoPlay();
}

function runRandomSimulation() {
    // 随机仿真: 两个玩家都随机行动直到结束 / Random simulation: both players act randomly
    let tempState = createGameState({ bigBlind: 100, smallBlind: 50, stackSize: 10000 });
    tempState = startNewHand(tempState, false);

    let safety = 0;
    while (!tempState.isHandComplete && safety < 50) {
        const p = tempState.currentPlayer;
        const avail = getAvailableActions(tempState);
        if (avail.length === 0) {
            break;
        }
        const action = avail[Math.floor(Math.random() * avail.length)];

        // 随机金额 / Random amount
        let amount = 0;
        if (action === ACTION_BET || action === ACTION_RAISE) {
            const minBet = tempState.bigBlind;
            const maxBet = tempState.players[p].stack;
            amount = minBet + Math.floor(Math.random() * Math.max(1, maxBet - minBet + 1));
        }

        try {
            tempState = executeAction(tempState, action, amount);
        } catch (e) {
            // 如果行动非法，尝试过牌 / If illegal, try check
            try {
                tempState = executeAction(tempState, ACTION_CHECK, 0);
            } catch (e2) {
                tempState = executeAction(tempState, ACTION_FOLD, 0);
            }
        }
        safety++;
    }

    // 显示结果但不改变当前游戏 / Show result without changing current game
    showSimulationResult(tempState);
}

// ============================================================================
// 玩家行动 / Player Actions
// ============================================================================

function handlePlayerAction(action, amount = 0) {
    if (!gameState || gameState.isHandComplete || isAnimating) return;

    try {
        gameState = executeAction(gameState, action, amount);
        render();

        if (gameState.isHandComplete) {
            showHandResult();
        } else {
            checkAutoPlay();
        }
    } catch (e) {
        console.error('Action error:', e.message);
    }
}

function checkAutoPlay() {
    if (!gameState || gameState.isHandComplete) return;

    const p = gameState.currentPlayer;

    // AI vs AI模式 / AI vs AI mode
    if (gameMode === 'ai-vs-ai') {
        setTimeout(() => playAIAction(p), 800);
        return;
    }

    // 人类模式下，如果轮到对手，让AI行动 / Human mode: AI acts for opponent
    if (p !== humanPlayerId) {
        setTimeout(() => playAIAction(p), 600);
    }
}

function playAIAction(playerId) {
    if (!gameState || gameState.isHandComplete) return;

    const avail = getAvailableActions(gameState);
    if (avail.length === 0) return;

    // 使用GTO策略或基于权益的启发式 / Use GTO strategy or equity-based heuristic
    let action, amount = 0;

    // 尝试获取GTO建议 / Try GTO advice
    const gtoAdvice = getGTOAdvice(playerId);
    if (gtoAdvice && gtoAdvice.actions.length > 0 && Math.random() < 0.85) {
        // 85%概率遵循GTO，15%随机偏离以增加多样性 / 85% follow GTO, 15% random
        const rand = Math.random();
        let cumProb = 0;
        let chosen = gtoAdvice.actions[0];
        for (const a of gtoAdvice.actions) {
            cumProb += a.probability;
            if (rand <= cumProb) {
                chosen = a;
                break;
            }
        }
        action = chosen.concrete.action;
        amount = chosen.concrete.amount;
    } else {
        // 启发式策略 / Heuristic strategy
        const equity = estimateEquity(playerId);
        const toCall = getAmountToCall(gameState, playerId);
        const pot = getTotalPot(gameState);

        if (toCall === 0) {
            // 无人下注 / No bet
            if (equity > 0.65) {
                action = ACTION_BET;
                amount = Math.floor(pot * 0.75);
            } else if (equity > 0.4) {
                action = ACTION_CHECK;
            } else {
                action = Math.random() < 0.3 ? ACTION_BET : ACTION_CHECK;
                if (action === ACTION_BET) amount = Math.floor(pot * 0.5);
            }
        } else {
            // 需要跟注 / Need to call
            const potOdds = toCall / (pot + toCall);
            if (equity > potOdds + 0.1) {
                action = ACTION_CALL;
            } else if (equity > potOdds - 0.05) {
                // 边缘决策 / Marginal decision
                action = Math.random() < 0.5 ? ACTION_CALL : ACTION_FOLD;
            } else {
                action = ACTION_FOLD;
            }
        }
    }

    // 确保行动可用 / Ensure action is available
    if (!avail.includes(action)) {
        if (avail.includes(ACTION_CHECK)) action = ACTION_CHECK;
        else if (avail.includes(ACTION_CALL)) action = ACTION_CALL;
        else if (avail.includes(ACTION_FOLD)) action = ACTION_FOLD;
        else action = avail[0];
    }

    handlePlayerAction(action, amount);
}

// ============================================================================
// GTO策略获取 / GTO Strategy Retrieval
// ============================================================================

function getGTOAdvice(playerId) {
    // 计算手牌权益 / Calculate hand equity
    const equity = estimateEquity(playerId);

    // 使用理论计算器 / Use theoretical calculator
    const advice = GTOCalculator.calculateAdvice(gameState, playerId, { equity });
    return advice;
}

function estimateEquity(playerId) {
    const p = gameState.players[playerId];
    const opponent = gameState.players[1 - playerId];

    if (p.holeCards.length === 0) return 0.5;

    // 如果知道对手手牌（AI vs AI或全显模式），直接计算 / If opponent cards known
    if (revealAllCards || gameMode === 'ai-vs-ai') {
        const result = calculateEquity(
            p.holeCards,
            opponent.holeCards,
            gameState.communityCards,
            500 // 较少模拟以加快速度 / Fewer sims for speed
        );
        return playerId === 0 ? result.p1Win + result.tie * 0.5 : result.p2Win + result.tie * 0.5;
    }

    // 否则基于手牌强度和公共牌估算 / Estimate based on hand strength
    if (gameState.communityCards.length > 0) {
        const eval7 = evaluateSevenCardHand([...p.holeCards, ...gameState.communityCards]);
        const handType = eval7.strength >>> 20;

        // 基于牌型的粗略胜率映射 / Rough equity mapping by hand type
        const equityMap = { 1: 0.3, 2: 0.45, 3: 0.55, 4: 0.65, 5: 0.7, 6: 0.75, 7: 0.85, 8: 0.92, 9: 0.98 };
        return equityMap[handType] || 0.5;
    }

    // 翻前: 基于手牌类型粗略估计 / Preflop: rough estimate by hand type
    const r1 = RANK_INDEX.indexOf(p.holeCards[0][0]);
    const r2 = RANK_INDEX.indexOf(p.holeCards[1][0]);
    const suited = p.holeCards[0][1] === p.holeCards[1][1];
    const pair = r1 === r2;

    if (pair) {
        return 0.5 + r1 * 0.04; // AA ~ 98%, 22 ~ 50%
    }
    const high = Math.max(r1, r2);
    const low = Math.min(r1, r2);
    let base = 0.45 + high * 0.025;
    if (suited) base += 0.03;
    if (high - low <= 3) base += 0.02;
    return Math.min(0.85, base);
}

// ============================================================================
// 渲染 / Rendering
// ============================================================================

function render() {
    if (!gameState) return;

    renderPlayers();
    renderCommunityCards();
    renderPot();
    renderPhase();
    renderActionPanel();
    renderGameInfo();
    renderGTOAdvice();
    renderHistory();
}

function renderPlayers() {
    for (let i = 0; i < 2; i++) {
        const p = gameState.players[i];
        const pos = els.playerPositions[i];
        const cardsEl = els.playerCards[i];
        const stackEl = els.playerStacks[i];
        const betEl = els.playerBets[i];
        const statusEl = els.playerStatus[i];

        // 更新状态类 / Update status classes
        pos.classList.toggle('active', gameState.currentPlayer === i && !gameState.isHandComplete);
        pos.classList.toggle('folded', !p.isActive);
        pos.classList.toggle('all-in', p.isAllIn);

        // 筹码显示 / Stack display
        stackEl.textContent = p.stack.toLocaleString();

        // 下注显示 / Bet display
        const currentBet = gameState.playerBets[i];
        if (currentBet > 0) {
            betEl.innerHTML = `
                <span class="chip"></span>
                <span class="bet-amount">${currentBet.toLocaleString()}</span>
            `;
            betEl.style.visibility = 'visible';
        } else {
            betEl.style.visibility = 'hidden';
        }

        // 状态文字 / Status text
        if (!p.isActive) {
            statusEl.textContent = 'Folded / 已弃牌';
        } else if (p.isAllIn) {
            statusEl.textContent = 'All-in / 全押';
        } else {
            statusEl.textContent = '';
        }

        // 手牌显示 / Card display
        const showCards = revealAllCards || i === humanPlayerId || gameState.isHandComplete || gameMode === 'ai-vs-ai';
        if (showCards && p.holeCards.length === 2) {
            cardsEl.innerHTML = p.holeCards.map(c => createCardHTML(c)).join('');
        } else if (p.holeCards.length === 2) {
            cardsEl.innerHTML = '<div class="card card-back"></div><div class="card card-back"></div>';
        } else {
            cardsEl.innerHTML = '';
        }

        // 庄家按钮 / Dealer button
        els.dealerBtns[i].classList.toggle('visible', i === 0); // Player 0 is always BTN in heads-up
    }
}

function createCardHTML(card) {
    const rank = card[0];
    const suit = card[1];
    const isRed = suit === 'h' || suit === 'd';
    const symbol = SUIT_SYMBOLS[suit];

    return `<div class="card ${isRed ? 'red' : 'black'}"><span class="rank">${rank}</span><span class="suit">${symbol}</span><span class="rank-bottom">${rank}</span></div>`;
}

function renderCommunityCards() {
    const cards = gameState.communityCards;
    let html = '';

    for (let i = 0; i < 5; i++) {
        if (i < cards.length) {
            html += createCardHTML(cards[i]);
        } else {
            html += '<div class="card slot"></div>';
        }
    }

    els.communityCards.innerHTML = html;
}

function renderPot() {
    const total = getTotalPot(gameState);
    els.potAmount.textContent = total.toLocaleString();
}

function renderPhase() {
    const phaseNames = {
        [PHASE_PREFLOP]: 'Preflop / 翻前',
        [PHASE_FLOP]: 'Flop / 翻牌',
        [PHASE_TURN]: 'Turn / 转牌',
        [PHASE_RIVER]: 'River / 河牌',
        [PHASE_SHOWDOWN]: 'Showdown / 摊牌',
        [PHASE_ENDED]: 'Ended / 结束'
    };
    els.phaseIndicator.textContent = phaseNames[gameState.phase] || gameState.phase;
}

function renderActionPanel() {
    if (gameState.isHandComplete) {
        els.actionPanel.style.display = 'none';
        return;
    }

    const p = gameState.currentPlayer;

    // 如果是AI的回合且不是AI vs AI模式，隐藏按钮 / If AI's turn and not AI vs AI, hide buttons
    if (gameMode === 'human' && p !== humanPlayerId) {
        els.actionPanel.style.display = 'flex';
        els.actionText.textContent = 'Opponent thinking... / 对手思考中...';
        els.callAmount.textContent = '';
        els.actionButtons.innerHTML = '';
        return;
    }

    els.actionPanel.style.display = 'flex';
    const avail = getAvailableActions(gameState);
    const toCall = getAmountToCall(gameState, p);

    if (p === humanPlayerId) {
        els.actionText.textContent = 'Your turn / 你的回合';
    } else {
        els.actionText.textContent = 'AI thinking... / AI思考中...';
    }

    if (toCall > 0) {
        els.callAmount.textContent = `(Call / 跟注 ${toCall.toLocaleString()})`;
    } else {
        els.callAmount.textContent = '';
    }

    // 生成行动按钮 / Generate action buttons
    let html = '';
    for (const action of avail) {
        const btnClass = getActionButtonClass(action);
        const label = getActionLabel(action, toCall);
        html += `<button class="btn-action ${btnClass}" data-action="${action}">
            ${label}
        </button>`;
    }
    els.actionButtons.innerHTML = html;

    // 按钮点击通过事件委托在init中处理 / Button clicks handled via event delegation in init()


function getActionButtonClass(action) {
    switch (action) {
        case ACTION_FOLD: return 'btn-fold';
        case ACTION_CHECK:
        case ACTION_CALL: return 'btn-call';
        case ACTION_BET:
        case ACTION_RAISE:
        case ACTION_ALL_IN: return 'btn-raise';
        default: return 'btn-secondary';
    }
}

function getActionLabel(action, toCall) {
    switch (action) {
        case ACTION_FOLD: return 'Fold / 弃牌';
        case ACTION_CHECK: return 'Check / 过牌';
        case ACTION_CALL: return `Call / 跟注${toCall > 0 ? '\n' + toCall : ''}`;
        case ACTION_BET: return 'Bet / 下注';
        case ACTION_RAISE: return 'Raise / 加注';
        case ACTION_ALL_IN: return 'All-in / 全押';
        default: return action;
    }
}

function promptBetAmount(action) {
    const pot = getTotalPot(gameState);
    const minBet = gameState.minRaise || gameState.bigBlind;
    const maxBet = gameState.players[gameState.currentPlayer].stack;
    const toCall = getAmountToCall(gameState, gameState.currentPlayer);

    const defaultAmount = action === ACTION_BET
        ? Math.floor(pot * 0.75)
        : Math.floor(pot + toCall);

    const input = prompt(
        `Enter amount / 输入金额:\nMin / 最小: ${minBet}\nMax / 最大: ${maxBet}`,
        defaultAmount.toString()
    );

    const amount = parseInt(input);
    if (isNaN(amount)) return defaultAmount;
    return Math.max(minBet, Math.min(maxBet, amount));
}

function renderGameInfo() {
    els.handNumber.textContent = gameState.handNumber;
    els.currentBet.textContent = gameState.currentBet.toLocaleString();

    const toCall = getAmountToCall(gameState, humanPlayerId);
    els.toCall.textContent = toCall > 0 ? toCall.toLocaleString() : '-';

    const odds = getPotOdds(gameState, humanPlayerId);
    els.potOdds.textContent = odds > 0 ? `${(odds * 100).toFixed(1)}%` : '-';

    const mdf = getMDF(gameState, humanPlayerId);
    els.mdf.textContent = toCall > 0 ? `${(mdf * 100).toFixed(1)}%` : '-';
}

function renderGTOAdvice() {
    if (!showGTO || !gameState) return;

    const p = gameMode === 'human' ? humanPlayerId : gameState.currentPlayer;
    const advice = getGTOAdvice(p);

    if (!advice) return;

    els.gtoInfoSet.textContent = `Info Set / 信息集: ${advice.infoSet}`;

    // 渲染动作概率 / Render action probabilities
    let actionsHtml = '';
    advice.actions.forEach((a, idx) => {
        const isBest = idx === 0;
        const pct = (a.probability * 100).toFixed(1);
        actionsHtml += `
            <div class="gto-action-item ${isBest ? 'best' : ''}">
                <div class="gto-action-header">
                    <span class="gto-action-name">${a.actionName}</span>
                    <span class="gto-action-prob">${pct}%</span>
                </div>
                <div class="gto-action-bar">
                    <div class="gto-action-bar-fill" style="width: ${pct}%"></div>
                </div>
                <div class="gto-action-reason">${a.reason}</div>
            </div>
        `;
    });
    els.gtoActions.innerHTML = actionsHtml;

    // 渲染理论值 / Render theory values
    const t = advice.theory;
    els.gtoTheory.innerHTML = `
        <div class="theory-row"><span>Pot Odds / 底池赔率</span><span>${(t.potOdds * 100).toFixed(1)}%</span></div>
        <div class="theory-row"><span>MDF / 最小防守</span><span>${(t.mdf * 100).toFixed(1)}%</span></div>
        <div class="theory-row"><span>Est. Equity / 估算权益</span><span>${(t.equity * 100).toFixed(1)}%</span></div>
        <div class="theory-row"><span>EV Call / 跟注EV</span><span>${t.evCall.toFixed(0)}</span></div>
        <div class="theory-row"><span>Pot / 底池</span><span>${t.pot.toLocaleString()}</span></div>
    `;
}

function renderHistory() {
    const history = gameState.handHistory.filter(h =>
        h.event === 'FOLD' || h.event === 'CHECK' || h.event === 'CALL' ||
        h.event === 'BET' || h.event === 'RAISE' || h.event === 'ALL_IN' ||
        h.event === 'HAND_STARTED' || h.event === 'SHOWDOWN' || h.event === 'FOLD_WIN'
    );

    let html = '';
    for (const h of history.slice(-20).reverse()) {
        const playerName = h.player !== undefined ? `P${h.player + 1}` : '';
        const phase = h.phase ? h.phase.toUpperCase().slice(0, 3) : '';

        if (h.event === 'HAND_STARTED') {
            html += `<div class="history-item"><span class="h-phase">HAND ${h.handNumber}</span> started / 开始</div>`;
        } else if (h.event === 'SHOWDOWN') {
            const winners = h.winners.map(w => `P${w.id + 1}`).join(', ');
            html += `<div class="history-item"><span class="h-phase">SD</span> <span class="h-action">Winners / 胜者: ${winners}</span></div>`;
        } else if (h.event === 'FOLD_WIN') {
            html += `<div class="history-item"><span class="h-phase">WIN</span> P${h.winner + 1} wins / 获胜 <span class="h-amount">${h.winAmount}</span></div>`;
        } else {
            const actionMap = {
                'FOLD': 'Fold / 弃牌', 'CHECK': 'Check / 过牌', 'CALL': 'Call / 跟注',
                'BET': 'Bet / 下注', 'RAISE': 'Raise / 加注', 'ALL_IN': 'All-in / 全押'
            };
            const actionText = actionMap[h.event] || h.event;
            const amountText = h.amount > 0 ? ` <span class="h-amount">${h.amount}</span>` : '';
            html += `<div class="history-item"><span class="h-phase">${phase}</span> ${playerName}: <span class="h-action">${actionText}</span>${amountText}</div>`;
        }
    }

    els.historyList.innerHTML = html || '<div class="history-item">No actions yet / 暂无行动</div>';
}

// ============================================================================
// 结果显示 / Result Display
// ============================================================================

function showHandResult() {
    const winners = gameState.winners;
    if (winners.length === 0) return;

    let title, details;

    if (winners[0].byFold) {
        title = 'Fold Win / 弃牌获胜';
        details = `<div class="result-winner">${winners[0].name} wins ${winners[0].winAmount.toLocaleString()}</div>
                   <p>Opponent folded / 对手弃牌</p>`;
    } else {
        title = 'Showdown / 摊牌结果';
        let playersHtml = '';
        for (const p of gameState.players) {
            if (!p.holeCards.length) continue;
            const eval7 = evaluateSevenCardHand([...p.holeCards, ...gameState.communityCards]);
            const isWinner = winners.some(w => w.id === p.id);
            playersHtml += `
                <div style="margin: 12px 0; padding: 10px; border-radius: 8px; background: ${isWinner ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.05)'}">
                    <strong>${p.name}${isWinner ? ' (Winner/胜者)' : ''}</strong><br>
                    <div class="result-cards">${p.holeCards.map(c => createCardHTML(c)).join('')}</div>
                    <span class="result-hand-type">${eval7.handType}</span>
                </div>
            `;
        }

        const winnerNames = winners.map(w => w.name).join(', ');
        details = `
            <div class="result-winner">Winner / 胜者: ${winnerNames}</div>
            <div style="margin: 12px 0;">Pot / 底池: ${winners[0].winAmount.toLocaleString()}</div>
            ${playersHtml}
        `;
    }

    els.resultTitle.textContent = title;
    els.resultDetails.innerHTML = details;
    els.resultModal.classList.add('active');

    render(); // 重新渲染以显示所有牌
}

function showSimulationResult(state) {
    const winners = state.winners;
    if (!winners || winners.length === 0) return;

    els.resultTitle.textContent = 'Random Simulation / 随机仿真结果';

    let details = '';
    for (const p of state.players) {
        const eval7 = evaluateSevenCardHand([...p.holeCards, ...state.communityCards]);
        const isWinner = winners.some(w => w.id === p.id);
        details += `
            <div style="margin: 12px 0; padding: 10px; border-radius: 8px; background: ${isWinner ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.05)'}">
                <strong>${p.name}${isWinner ? ' (Winner/胜者)' : ''}</strong><br>
                <div class="result-cards">${p.holeCards.map(c => createCardHTML(c)).join('')}</div>
                <span class="result-hand-type">${eval7.handType}</span><br>
                Final Stack / 最终筹码: ${p.stack.toLocaleString()}
            </div>
        `;
    }

    // 公共牌 / Community cards
    details += `<div style="margin-top: 16px;">
        <strong>Community / 公共牌</strong><br>
        <div class="result-cards">${state.communityCards.map(c => createCardHTML(c)).join('')}</div>
    </div>`;

    els.resultDetails.innerHTML = details;
    els.resultModal.classList.add('active');
}

// ============================================================================
// CFR 训练 / CFR Training
// ============================================================================

async function trainCFR() {
    const iterations = parseInt(document.getElementById('train-iterations').value) || 10000;

    if (!cfrTrainer) {
        cfrTrainer = new MCCFRTrainer({ iterations, printInterval: 1000 });
    }

    els.trainingProgress.textContent = 'Training started... / 训练开始...';
    els.btnTrain.disabled = true;

    // 使用setTimeout让UI更新 / Use setTimeout for UI updates
    await new Promise(resolve => {
        setTimeout(() => {
            cfrTrainer.train((iter, total, elapsed) => {
                const pct = ((iter / total) * 100).toFixed(1);
                const itersPerSec = (iter / elapsed).toFixed(0);
                els.trainingProgress.textContent =
                    `Progress / 进度: ${pct}% (${iter}/${total}) | ${itersPerSec} it/s`;
            });
            resolve();
        }, 100);
    });

    els.trainingProgress.textContent = 'Training complete! / 训练完成！';
    els.btnTrain.disabled = false;
}

function exportStrategy() {
    if (!cfrTrainer) {
        alert('Please train first! / 请先进行训练！');
        return;
    }

    const data = cfrTrainer.exportStrategy();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `poker-gto-strategy-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================================================
// 启动 / Startup
// ============================================================================

init();
