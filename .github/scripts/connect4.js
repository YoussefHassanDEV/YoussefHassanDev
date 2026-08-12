#!/usr/bin/env node
/**
 * Connect Four — bitboard engine with negamax, alpha-beta pruning and a transposition table.
 *
 * The interesting part isn't the game, it's how the position is represented. The board is two
 * 49-bit masks (BigInt, because JS bitwise operators truncate to 32 bits): one for the side to
 * move, one for every stone on the board. Columns are 7 bits tall for a 6-row board — the extra
 * sentinel row is what makes the win detection below correct without bounds checks.
 *
 *   bit index = column * 7 + row        (row 0 = bottom)
 *
 *   .  .  .  .  .  .  .     <- sentinel row (always 0, stops wraparound)
 *   5 12 19 26 33 40 47
 *   4 11 18 25 32 39 46
 *   3 10 17 24 31 38 45
 *   2  9 16 23 30 37 44
 *   1  8 15 22 29 36 43
 *   0  7 14 21 28 35 42
 *
 * Win detection is then four shift-and-test pairs over the whole board at once, rather than
 * scanning 69 possible lines:
 *
 *   m = p & (p >> 7);  m & (m >> 14)   -> four in a row horizontally
 *
 * Because a run of four exists iff the position ANDed with itself shifted by the direction, twice,
 * is non-zero. Same trick for vertical (shift 1) and both diagonals (shifts 6 and 8).
 *
 * Search is negamax with alpha-beta, centre-first move ordering (centre columns appear in far more
 * winning lines, so they cause earlier cutoffs), and a transposition table keyed on the position.
 *
 * Usage:  node connect4.js <column 0-6>
 *         node connect4.js --render
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const STATE_FILE = path.join(ROOT, '.github', 'data', 'connect4.json')
const README = path.join(ROOT, 'README.md')
const START = '<!-- C4:START -->'
const END = '<!-- C4:END -->'

const WIDTH = 7
const HEIGHT = 6
const H1 = BigInt(HEIGHT + 1) // 7 — one column's worth of bits, including the sentinel
const SIZE = WIDTH * (HEIGHT + 1)
const MAX_DEPTH = 9 // plies searched; ~8-9 plays a strong game while staying inside the runner
const REPO = process.env.GITHUB_REPOSITORY || 'YoussefHassanDEV/YoussefHassanDev'

const HUMAN = 'R'
const BOT = 'Y'
const EMPTY = '.'

// ---------------------------------------------------------------- board <-> bitboard

const defaultState = () => ({ grid: EMPTY.repeat(WIDTH * HEIGHT), wins: 0, losses: 0, draws: 0, moves: 0 })

const readState = () => {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    if (typeof s.grid !== 'string' || s.grid.length !== WIDTH * HEIGHT) return defaultState()
    return { ...defaultState(), ...s }
  } catch {
    return defaultState()
  }
}

const writeState = (s) => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(s, null, 2)}\n`)
}

// grid is row-major from the TOP row down, which is how it reads in the README.
const at = (grid, col, row) => grid[(HEIGHT - 1 - row) * WIDTH + col]
const setAt = (grid, col, row, ch) => {
  const i = (HEIGHT - 1 - row) * WIDTH + col
  return grid.slice(0, i) + ch + grid.slice(i + 1)
}

const toBitboards = (grid, sideToMove) => {
  let position = 0n
  let mask = 0n
  for (let col = 0; col < WIDTH; col++) {
    for (let row = 0; row < HEIGHT; row++) {
      const cell = at(grid, col, row)
      if (cell === EMPTY) continue
      const bit = 1n << (BigInt(col) * H1 + BigInt(row))
      mask |= bit
      if (cell === sideToMove) position |= bit
    }
  }
  return { position, mask }
}

// Four-in-a-row test: AND the position with itself shifted, twice, per direction.
const isWin = (p) => {
  let m = p & (p >> H1)                 // horizontal  (neighbouring columns)
  if (m & (m >> (2n * H1))) return true
  m = p & (p >> (H1 - 1n))              // diagonal /
  if (m & (m >> (2n * (H1 - 1n)))) return true
  m = p & (p >> (H1 + 1n))              // diagonal \
  if (m & (m >> (2n * (H1 + 1n)))) return true
  m = p & (p >> 1n)                     // vertical
  if (m & (m >> 2n)) return true
  return false
}

const TOP_MASK = (col) => 1n << (BigInt(col) * H1 + BigInt(HEIGHT - 1))
const BOTTOM_MASK = (col) => 1n << (BigInt(col) * H1)
const canPlay = (mask, col) => (mask & TOP_MASK(col)) === 0n
// Dropping a stone: the lowest free cell in the column is mask + bottom, masked to the column.
const play = (position, mask, col) => {
  const newMask = mask | (mask + BOTTOM_MASK(col))
  return { position: position ^ newMask, mask: newMask } // ^ swaps the side to move
}
const isWinningMove = (position, mask, col) => {
  const next = mask | (mask + BOTTOM_MASK(col))
  return isWin(position | (next ^ mask))
}

// Centre-first. A centre stone participates in more winning lines than an edge one, so trying
// those first produces cutoffs earlier and shrinks the tree dramatically.
const MOVE_ORDER = [3, 2, 4, 1, 5, 0, 6]

// ---------------------------------------------------------------- search

const negamax = (position, mask, depth, alpha, beta, moves, table) => {
  const key = (position + mask).toString()
  const cached = table.get(key)
  if (cached !== undefined && cached.depth >= depth) return cached.score

  // Immediate win available? Score it high, and prefer faster wins.
  for (const col of MOVE_ORDER) {
    if (canPlay(mask, col) && isWinningMove(position, mask, col)) {
      return (SIZE - moves) / 2
    }
  }

  if (moves >= WIDTH * HEIGHT) return 0 // drawn — board full
  if (depth === 0) return 0             // horizon: treat as neutral, ordering does the work

  let best = -1000
  for (const col of MOVE_ORDER) {
    if (!canPlay(mask, col)) continue
    const next = play(position, mask, col)
    const score = -negamax(next.position, next.mask, depth - 1, -beta, -alpha, moves + 1, table)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break // opponent has a better option elsewhere; stop looking
  }

  table.set(key, { score: best, depth })
  return best
}

const chooseMove = (grid, moves) => {
  const { position, mask } = toBitboards(grid, BOT)
  const legal = MOVE_ORDER.filter((c) => canPlay(mask, c))
  if (!legal.length) return -1

  // Take an immediate win, and block an immediate loss, without paying for a search.
  for (const col of legal) if (isWinningMove(position, mask, col)) return col
  const oppPosition = position ^ mask
  for (const col of legal) if (isWinningMove(oppPosition, mask, col)) return col

  const table = new Map()
  let bestCol = legal[0]
  let bestScore = -Infinity
  for (const col of legal) {
    const next = play(position, mask, col)
    const score = -negamax(next.position, next.mask, MAX_DEPTH - 1, -1000, 1000, moves + 1, table)
    if (score > bestScore) {
      bestScore = score
      bestCol = col
    }
  }
  return bestCol
}

// ---------------------------------------------------------------- game

const dropInto = (grid, col, mark) => {
  for (let row = 0; row < HEIGHT; row++) {
    if (at(grid, col, row) === EMPTY) return setAt(grid, col, row, mark)
  }
  return null // column full
}

const winnerOf = (grid) => {
  for (const mark of [HUMAN, BOT]) {
    const { position } = toBitboards(grid, mark)
    if (isWin(position)) return mark
  }
  return grid.includes(EMPTY) ? null : 'draw'
}

// ---------------------------------------------------------------- rendering

const DISC = { [HUMAN]: '🔴', [BOT]: '🟡', [EMPTY]: '⚫' }

const renderBoard = (state) => {
  const { grid } = state
  const over = winnerOf(grid)

  const header = Array.from({ length: WIDTH }, (_, c) => {
    const full = at(grid, c, HEIGHT - 1) !== EMPTY
    if (over || full) return '➖'
    const url = `https://github.com/${REPO}/issues/new?title=c4-drop-${c}&body=Press+%22Create%22+%E2%80%94+the+engine+replies+in+about+a+minute.`
    return `[⬇️](${url})`
  }).join(' | ')

  const rows = []
  for (let row = HEIGHT - 1; row >= 0; row--) {
    rows.push(`| ${Array.from({ length: WIDTH }, (_, c) => DISC[at(grid, c, row)]).join(' | ')} |`)
  }

  let status
  if (over === HUMAN) status = '🎉 **You beat the engine.** Genuinely well played — new board below.'
  else if (over === BOT) status = '🤖 **Engine wins.** Rematch?'
  else if (over === 'draw') status = '🤝 **Draw** — full board, no four in a row.'
  else status = 'Drop a disc with the ⬇️ arrows. You are 🔴, the engine is 🟡.'

  return [
    START,
    '',
    '### 🔴 Connect Four — against a real search engine',
    '',
    'Not a toy. Bitboard position representation, **negamax with alpha-beta pruning**, a',
    `transposition table and centre-first move ordering, searching **${MAX_DEPTH} plies**.`,
    'It will punish a careless move.',
    '',
    `| ${header} |`,
    `|${' :--: |'.repeat(WIDTH)}`,
    rows.join('\n'),
    '',
    status,
    '',
    `🏆 You **${state.wins}** · 🤖 Engine **${state.losses}** · 🤝 Draws **${state.draws}**`,
    '',
    `<sub>How it works: the board is two 49-bit masks, and a four-in-a-row is detected by ANDing`,
    `the position with itself shifted twice — four shift-pairs cover all 69 possible lines at once.`,
    `[Read the engine](https://github.com/${REPO}/blob/main/.github/scripts/connect4.js).</sub>`,
    '',
    END,
  ].join('\n')
}

const updateReadme = (state) => {
  let md = fs.readFileSync(README, 'utf8')
  const block = renderBoard(state)
  if (md.includes(START) && md.includes(END)) {
    md = md.slice(0, md.indexOf(START)) + block + md.slice(md.indexOf(END) + END.length)
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

  const col = Number.parseInt(arg, 10)
  if (!Number.isInteger(col) || col < 0 || col >= WIDTH) {
    console.log(`Column ${arg} doesn't exist — pick 0-6.`)
    return
  }

  if (winnerOf(state.grid)) {
    state.grid = EMPTY.repeat(WIDTH * HEIGHT)
    state.moves = 0
  }

  const afterHuman = dropInto(state.grid, col, HUMAN)
  if (afterHuman === null) {
    updateReadme(state)
    console.log('That column is full — try another.')
    return
  }
  state.grid = afterHuman
  state.moves += 1

  let result = winnerOf(state.grid)
  let message

  if (!result) {
    const reply = chooseMove(state.grid, state.moves)
    if (reply >= 0) {
      state.grid = dropInto(state.grid, reply, BOT) ?? state.grid
      state.moves += 1
      result = winnerOf(state.grid)
    }
  }

  if (result === HUMAN) {
    state.wins += 1
    message = 'You beat the engine — that takes doing at 9 plies. Board reset.'
  } else if (result === BOT) {
    state.losses += 1
    message = 'Four in a row. Board reset — go again?'
  } else if (result === 'draw') {
    state.draws += 1
    message = 'Draw — full board. Board reset.'
  } else {
    message = 'Disc dropped, engine replied. Your move.'
  }

  if (result) {
    state.grid = EMPTY.repeat(WIDTH * HEIGHT)
    state.moves = 0
  }

  writeState(state)
  updateReadme(state)
  console.log(message)
}

main()
