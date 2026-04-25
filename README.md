# Texas Hold'em GTO Solver / 德州扑克 GTO 求解器

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A complete heads-up Texas Hold'em simulation engine with Game Theory Optimal (GTO) strategy computation, featuring an interactive HTML5 game interface. / 一个完整的德州扑克单挑仿真引擎，集成博弈论最优（GTO）策略计算，配有交互式 HTML5 游戏界面。

## Features / 功能特性

### Game Engine / 游戏引擎
- **Standard Texas Hold'em Rules** / 标准德州扑克规则: Full support for blinds, betting rounds, pot calculation, and showdown. / 完整支持盲注、下注轮次、底池计算与摊牌。
- **Hand Evaluation** / 牌力评估: Accurate 7-card evaluator determining the best 5-card hand from all combinations. / 精确的7张牌评估器，从所有组合中选出最佳5张牌。
- **Two-Player Heads-Up** / 单挑模式: Optimized for heads-up play (SB/BTN vs BB). / 针对单挑玩法优化（小盲/按钮位 vs 大盲）。

### Interactive UI / 交互界面
- **Visual Poker Table** / 可视化扑克桌: Realistic green felt table with animated card dealing. / 逼真的绿色毛毡桌，带动画发牌效果。
- **Human vs AI** / 人机对弈: Play against an AI opponent with adjustable strategy. / 与可调策略的AI对手对战。
- **AI vs AI Simulation** / AI对弈仿真: Watch two AI players compete using GTO strategies. / 观看两个AI玩家使用GTO策略对弈。
- **Random Simulation** / 随机仿真: Run random hand simulations to explore outcomes. / 运行随机手牌仿真以探索结果。

### GTO Solver / GTO 求解器
- **Theoretical GTO Calculator** / 理论GTO计算器: Real-time calculation of:
  - Pot Odds / 底池赔率
  - Minimum Defense Frequency (MDF) / 最小防守频率
  - Expected Value (EV) / 期望价值
  - Action frequencies based on hand equity / 基于手牌权益的行动频率
- **MCCFR Algorithm** / MCCFR算法: Monte Carlo Counterfactual Regret Minimization for approximating Nash equilibrium strategies. / 蒙特卡洛反事实遗憾最小化，用于近似纳什均衡策略。
- **Strategy Export/Import** / 策略导出/导入: Save and load trained strategies as JSON. / 以JSON格式保存和加载训练好的策略。

## Project Structure / 项目结构

```
poker-gto-solver/
├── src/
│   ├── engine/              # Poker game engine / 扑克游戏引擎
│   │   ├── cards.js         # Deck management / 牌组管理
│   │   ├── evaluator.js     # Hand strength evaluation / 牌力评估
│   │   └── game.js          # Game state machine / 游戏状态机
│   ├── solver/              # GTO solver / GTO求解器
│   │   ├── abstraction.js   # Card & bet abstraction / 牌面与下注抽象
│   │   └── cfr.js           # CFR algorithm core / CFR算法核心
│   └── ui/                  # Web interface / 网页界面
│       ├── index.html       # Main page / 主页面
│       ├── style.css        # Styles / 样式
│       └── app.js           # Application logic / 应用逻辑
├── index.html               # Root entry point / 根入口
├── server.py                # Simple HTTP server / 简易HTTP服务器
└── README.md                # This file / 本文件
```

## Quick Start / 快速开始

### Method 1: Python HTTP Server / 方法1: Python HTTP服务器

```bash
cd poker-gto-solver
python -m http.server 8080
# Then open http://localhost:8080 in your browser
```

### Method 2: Node.js HTTP Server / 方法2: Node.js HTTP服务器

```bash
cd poker-gto-solver
npx serve .
# Or use any static file server
```

### Method 3: Direct Open (Limited) / 方法3: 直接打开 (有限制)

> Note: Modern browsers block ES6 module imports from `file://` protocol. Use a local server for full functionality. / 注意：现代浏览器会阻止 `file://` 协议的ES6模块导入。请使用本地服务器以获得完整功能。

## How to Play / 游戏指南

1. **New Hand** / 新牌局: Click to deal a new hand. / 点击发新牌。
2. **Select Game Mode** / 选择游戏模式:
   - *Human Play* / 人工对弈: You control Player 1 (BTN). AI plays Player 2 (BB). / 你控制玩家1（按钮位），AI控制玩家2（大盲）。
   - *AI vs AI* / AI对弈: Watch two AI players. / 观看两个AI玩家对弈。
3. **Actions** / 行动:
   - **Fold / 弃牌**: Give up the hand. / 放弃手牌。
   - **Check / 过牌**: Pass action without betting (when no bet). / 无人下注时跳过。
   - **Call / 跟注**: Match the current bet. / 匹配当前下注。
   - **Bet / 下注**: Place a new bet (enter amount). / 下新注（输入金额）。
   - **Raise / 加注**: Increase the bet (enter amount). / 增加下注（输入金额）。
   - **All-in / 全押**: Bet all remaining chips. / 押上所有剩余筹码。
4. **GTO Panel** / GTO面板: Toggle on/off to see real-time GTO strategy recommendations. / 开关以查看实时GTO策略建议。
5. **Reveal All** / 显示所有牌: Show all hole cards for analysis. / 显示所有手牌用于分析。

## CFR Training / CFR 训练

The project includes a browser-based MCCFR trainer. Due to computational limits, the default 10,000 iterations provide a basic approximation. For stronger play: / 本项目包含基于浏览器的MCCFR训练器。由于计算限制，默认的10,000次迭代提供基础近似。如需更强对弈能力：

1. Open the **CFR Training** panel in the sidebar. / 在侧边栏打开 **CFR训练** 面板。
2. Set iterations (e.g., 50,000). / 设置迭代次数（如50,000）。
3. Click **Train / 训练**. / 点击 **训练**。
4. Export the strategy for later use. / 导出策略以备后用。

## GTO Theory / GTO 理论

This solver implements key GTO concepts: / 本求解器实现了以下核心GTO概念：

### Minimum Defense Frequency (MDF) / 最小防守频率
```
MDF = Pot / (Pot + Bet)
```
Prevents opponents from profitably bluffing any two cards. / 防止对手用任意两张牌进行有利可图的诈唬。

### Pot Odds / 底池赔率
```
Required Equity = Call / (Pot + Call)
```
Minimum hand equity needed to justify a call. / 证明跟注合理所需的最小手牌权益。

### Regret Matching / 遗憾匹配
```
Strategy(a) = max(0, Regret(a)) / sum(max(0, Regret(b)))
```
Core of CFR: actions with higher cumulative regret are played more frequently. / CFR核心：累计遗憾更高的动作被更频繁地采用。

## Algorithm Details / 算法细节

### Monte Carlo CFR (MCCFR) / 蒙特卡洛CFR
- **External Sampling** / 外部采样: Samples opponent actions while updating one player's regrets. / 采样对手动作，同时更新一名玩家的遗憾值。
- **Information Sets** / 信息集: Game states grouped by (hand bucket, phase, board texture, action history). / 按（手牌桶、阶段、牌面纹理、行动历史）分组的游戏状态。
- **Abstraction** / 抽象:
  - *Card Abstraction* / 牌面抽象: 6 hand buckets (Nuts, Strong, Medium, Weak, Bluff, Draw). / 6个手牌桶（坚果、强牌、中等、弱牌、诈唬、听牌）。
  - *Bet Abstraction* / 下注抽象: 5 discrete actions (Fold, Check/Call, 1/2 Pot, Pot, All-in). / 5个离散动作（弃牌、过牌/跟注、半池、满池、全押）。

## Tech Stack / 技术栈
- Pure JavaScript (ES6 Modules) / 纯JavaScript (ES6模块)
- No external dependencies / 无外部依赖
- CSS3 with animations / CSS3动画

## Academic Background / 学术背景

This project draws from foundational poker AI research: / 本项目借鉴了扑克AI的基础研究：

- **Zinkevich et al. (2007)**: "Regret Minimization in Games with Incomplete Information" - Original CFR algorithm. / 原始CFR算法。
- **Tammelin (2014)**: "Solving Large Imperfect Information Games Using CFR+" - CFR+ improvements. / CFR+改进。
- **Brown & Sandholm (2017)**: "Safe and Nested Subgame Solving for Imperfect-Information Games" - Libratus. / Libratus。
- **Brown et al. (2019)**: "Superhuman AI for Multiplayer Poker" - Pluribus. / Pluribus。

## Limitations / 局限性

- **Simplified Abstraction** / 简化抽象: Full-scale GTO for no-limit hold'em requires ~10^161 information sets. This solver uses heavy abstraction for educational purposes. / 完整无限注德州扑克GTO需要约10^161个信息集。本求解器使用重度抽象以用于教育目的。
- **Browser Performance** / 浏览器性能: CFR training is limited by JavaScript single-thread performance. / CFR训练受JavaScript单线程性能限制。
- **Two-Player Only** / 仅单挑: Multiplayer GTO remains unsolved. / 多人GTO尚未解决。

## License / 许可证

MIT License - See LICENSE file for details. / MIT许可证 - 详见LICENSE文件。

## Author / 作者

Built with Claude Code for educational purposes. / 使用Claude Code构建，用于教育目的。

---

**Disclaimer**: This software is for educational and research purposes only. Poker involves financial risk; please gamble responsibly. / **免责声明**：本软件仅供教育和研究目的。扑克涉及财务风险；请负责任地游戏。
