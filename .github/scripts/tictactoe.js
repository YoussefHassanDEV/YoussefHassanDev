#!/usr/bin/env node
// Tic-tac-toe played from the profile README. Every empty square is a link that opens a
// pre-filled issue; the workflow runs this to apply the move, reply for the bot, rewrite the
// board back into the README, and close the issue.
//
// State lives in .github/data/tictactoe.json rather than being parsed back out of the README,
// so the rendering can change without risking the game state becoming unreadable.
//
// Usage:  node tictactoe.js <cell 0-8> [player]
//         node tictactoe.js --render        (re-draw the board without moving)

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const STATE_FILE = path.join(ROOT, '.github', 'data', 'tictactoe.json')
const README = path.join(ROOT, 'README.md')
const START = '<!-- TTT:START -->'
const END = '<!-- TTT:END -->'

const HUMAN = 'X'
const BOT = 'O'
const EMPTY = '-'

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
]

const REPO = process.env.GITHUB_REPOSITORY || 'YoussefHassanDEV/YoussefHassanDev'

const defaultState = () => ({ board: EMPTY.repeat(9), wins: 0, losses: 0, draws: 0, last: null })

const readState = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    // A truncated or hand-edited file must not wedge the game permanently.
    if (typeof parsed.board !== 'string' || parsed.board.length !== 9) return defaultState()
    return { ...defaultState(), ...parsed }
  } catch {
    return defaultState()
  }
}

const writeState = (state) => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)
}

const winner = (board) => {
  for (const [a, b, c] of LINES) {
    if (board[a] !== EMPTY && board[a] === board[b] && board[b] === board[c]) return board[a]
  }
  return board.includes(EMPTY) ? null : 'draw'
}

const place = (board, cell, mark) => board.slice(0, cell) + mark + board.slice(cell + 1)
const emptyCells = (board) => [...board].map((c, i) => (c === EMPTY ? i : -1)).filter((i) => i >= 0)

// Deliberately beatable. An unbeatable bot makes the whole thing pointless as a novelty —
// this one takes a win, blocks a loss, then prefers centre and corners, so it plays a
// respectable game while still losing to someone paying attention.
const botMove = (board) => {
  const free = emptyCells(board)
  for (const cell of free) if (winner(place(board, cell, BOT)) === BOT) return cell
  for (const cell of free) if (winner(place(board, cell, HUMAN)) === HUMAN) return cell
  if (board[4] === EMPTY) return 4
  const corners = [0, 2, 6, 8].filter((c) => board[c] === EMPTY)
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)]
  return free[Math.floor(Math.random() * free.length)]
}

// Rendered as a markdown table: an empty square is a link that opens a pre-filled issue, and a
// played square is a plain glyph so it can't be clicked twice.
const renderBoard = (state) => {
  const { board } = state
  const over = winner(board)
  const cell = (i) => {
    if (board[i] === HUMAN) return '❌'
    if (board[i] === BOT) return '⭕'
    if (over) return '⬜'
    const url = `https://github.com/${REPO}/issues/new?title=ttt-move-${i}&body=Just+press+%22Create%22+%E2%80%94+the+bot+replies+in+about+a+minute.`
    return `[⬜](${url})`
  }

  const rows = [0, 3, 6].map((r) => `| ${cell(r)} | ${cell(r + 1)} | ${cell(r + 2)} |`).join('\n')

  let status
  if (over === HUMAN) status = '**You won.** 🎉 A new board is ready below.'
  else if (over === BOT) status = '**I won this one.** Rematch below.'
  else if (over === 'draw') status = "**Draw.** New board's up."
  else if (state.last === null) status = 'Click any square to play. You are ❌.'
  else status = 'Your move — you are ❌.'

  return [
    START,
    '',
    '### 🎮 Play me at tic-tac-toe',
    '',
    "Click an empty square. It opens a pre-filled issue — just press **Create**, and a GitHub",
    'Action plays my move and updates this board in about a minute.',
    '',
    '|  |  |  |',
    '|:--:|:--:|:--:|',
    rows,
    '',
    status,
    '',
    `🏆 You **${state.wins}** · 🤖 Me **${state.losses}** · 🤝 Draws **${state.draws}**`,
    '',
    END,
  ].join('\n')
}

const updateReadme = (state) => {
  let md = fs.readFileSync(README, 'utf8')
  const block = renderBoard(state)
  if (md.includes(START) && md.includes(END)) {
    const before = md.slice(0, md.indexOf(START))
    const after = md.slice(md.indexOf(END) + END.length)
    md = before + block + after
  } else {
    md = `${md.trimEnd()}\n\n---\n\n${block}\n`
  }
  fs.writeFileSync(README, md)
}

const main = () => {
  const arg = process.argv[2]
  const state = readState()

  if (arg === '--render') {
    updateReadme(state)
    console.log('rendered')
    return
  }

  const cell = Number.parseInt(arg, 10)
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    console.log("That square doesn't exist — pick 0-8.")
    process.exit(0)
  }

  // A finished game left on the board means the next click starts fresh rather than being
  // rejected, so a stale link in someone's tab still does something sensible.
  if (winner(state.board)) state.board = EMPTY.repeat(9)

  if (state.board[cell] !== EMPTY) {
    updateReadme(state)
    console.log('That square is already taken — pick another.')
    process.exit(0)
  }

  state.board = place(state.board, cell, HUMAN)
  let result = winner(state.board)
  let message

  if (!result) {
    const reply = botMove(state.board)
    state.board = place(state.board, reply, BOT)
    state.last = reply
    result = winner(state.board)
  }

  if (result === HUMAN) {
    state.wins += 1
    message = 'You beat me. Well played — board reset for the next challenger.'
  } else if (result === BOT) {
    state.losses += 1
    message = 'Got you. Board reset — go again?'
  } else if (result === 'draw') {
    state.draws += 1
    message = 'Draw. Board reset.'
  } else {
    message = 'Move played. Your turn — the board on my profile is updated.'
  }

  if (result) state.board = EMPTY.repeat(9)

  writeState(state)
  updateReadme(state)
  console.log(message)
}

main()
