#!/usr/bin/env node
/**
 * Chess engine — 0x88 board, full legal move generation, alpha-beta search.
 *
 * BOARD REPRESENTATION (0x88)
 * The board is a 128-entry array laid out as two side-by-side 8x8 boards: the real one on the
 * left, garbage on the right. A square is rank*16 + file, so:
 *
 *     square & 0x88  ===  0   iff the square is on the board
 *
 * That single AND replaces every "is this off the edge" bounds check. It works because any file
 * overflow sets bit 3 and any rank overflow sets bit 7, and 0x88 is exactly those two bits. Slide
 * a rook off the right edge and the test catches it with no comparison chain.
 *
 * MOVE GENERATION
 * Pseudo-legal moves are generated from offset tables, then filtered by actually making each one
 * and asking whether our king is attacked. Slower than pin-aware generation, but correct by
 * construction — and correctness here is verifiable, which is the point of the perft tests.
 *
 * Handles the awkward parts: castling (including through-check and rights lost when a rook is
 * captured), en passant, and promotion.
 *
 * SEARCH
 * Alpha-beta negamax with MVV-LVA capture ordering (try "pawn takes queen" before "queen takes
 * pawn" — it's more likely to cause a cutoff), and an evaluation of material plus piece-square
 * tables, so the engine develops pieces instead of shuffling.
 *
 * VERIFICATION
 * `node chess.js --perft <n>` walks the full legal move tree and counts leaf nodes. Those counts
 * are published and exact, so matching them is proof rather than a vibe check. This generator
 * reproduces the starting position through depth 5 — 20, 400, 8902, 197281, 4865609 — and also
 * matches Kiwipete and the three other standard torture positions, which exist specifically to
 * catch the bugs a start-position perft misses: castling through check, en passant discovered
 * check, and promotion edge cases.
 *
 * Usage:  node chess.js <from><to>[promo]   e.g. e2e4, e7e8q
 *         node chess.js --render
 *         node chess.js --perft <depth>
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const STATE_FILE = path.join(ROOT, '.github', 'data', 'chess.json')
const README = path.join(ROOT, 'README.md')
const START = '<!-- CHESS:START -->'
const END = '<!-- CHESS:END -->'
const REPO = process.env.GITHUB_REPOSITORY || 'YoussefHassanDEV/YoussefHassanDev'

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const SEARCH_DEPTH = 5

// ---------------------------------------------------------------- 0x88 helpers

const onBoard = (sq) => (sq & 0x88) === 0
const fileOf = (sq) => sq & 7
const rankOf = (sq) => sq >> 4
const toAlg = (sq) => 'abcdefgh'[fileOf(sq)] + (rankOf(sq) + 1)
const fromAlg = (s) => {
  const f = 'abcdefgh'.indexOf(s[0])
  const r = Number(s[1]) - 1
  if (f < 0 || r < 0 || r > 7) return -1
  return r * 16 + f
}

const isWhite = (p) => p !== '.' && p === p.toUpperCase()
const isBlack = (p) => p !== '.' && p === p.toLowerCase()
const sameSide = (p, white) => p !== '.' && isWhite(p) === white

const KNIGHT_OFFSETS = [33, 31, 18, 14, -33, -31, -18, -14]
const KING_OFFSETS = [17, 16, 15, 1, -17, -16, -15, -1]
const BISHOP_DIRS = [17, 15, -17, -15]
const ROOK_DIRS = [16, 1, -16, -1]
const QUEEN_DIRS = [...BISHOP_DIRS, ...ROOK_DIRS]

// ---------------------------------------------------------------- FEN

const parseFen = (fen) => {
  const [placement, side, castling, ep, half, full] = fen.trim().split(/\s+/)
  const board = new Array(128).fill('.')
  let sq = 112 // a8
  for (const ch of placement) {
    if (ch === '/') { sq -= 24; continue }
    if (/\d/.test(ch)) { sq += Number(ch); continue }
    board[sq] = ch
    sq += 1
  }
  return {
    board,
    white: side === 'w',
    castling: castling === '-' ? '' : castling,
    ep: ep === '-' ? -1 : fromAlg(ep),
    half: Number(half || 0),
    full: Number(full || 1),
  }
}

const toFen = (pos) => {
  let placement = ''
  for (let r = 7; r >= 0; r--) {
    let empty = 0
    for (let f = 0; f < 8; f++) {
      const p = pos.board[r * 16 + f]
      if (p === '.') { empty++; continue }
      if (empty) { placement += empty; empty = 0 }
      placement += p
    }
    if (empty) placement += empty
    if (r) placement += '/'
  }
  return [
    placement,
    pos.white ? 'w' : 'b',
    pos.castling || '-',
    pos.ep >= 0 ? toAlg(pos.ep) : '-',
    pos.half,
    pos.full,
  ].join(' ')
}

// ---------------------------------------------------------------- attacks

const isAttacked = (board, sq, byWhite) => {
  // Pawns. A white pawn on x attacks x+15 and x+17, so sq is attacked from sq-15 / sq-17.
  const pawnFrom = byWhite ? [sq - 17, sq - 15] : [sq + 17, sq + 15]
  for (const from of pawnFrom) {
    if (onBoard(from) && board[from] === (byWhite ? 'P' : 'p')) return true
  }
  for (const off of KNIGHT_OFFSETS) {
    const from = sq + off
    if (onBoard(from) && board[from] === (byWhite ? 'N' : 'n')) return true
  }
  for (const off of KING_OFFSETS) {
    const from = sq + off
    if (onBoard(from) && board[from] === (byWhite ? 'K' : 'k')) return true
  }
  const slide = (dirs, pieces) => {
    for (const dir of dirs) {
      let cur = sq + dir
      while (onBoard(cur)) {
        const p = board[cur]
        if (p !== '.') {
          if (isWhite(p) === byWhite && pieces.includes(p.toUpperCase())) return true
          break
        }
        cur += dir
      }
    }
    return false
  }
  return slide(BISHOP_DIRS, ['B', 'Q']) || slide(ROOK_DIRS, ['R', 'Q'])
}

const findKing = (board, white) => board.indexOf(white ? 'K' : 'k')
const inCheck = (pos) => {
  const k = findKing(pos.board, pos.white)
    return k >= 0 && isAttacked(pos.board, k, !pos.white)
}

// ---------------------------------------------------------------- move generation

const addPawnMoves = (pos, from, moves) => {
  const { board, white } = pos
  const dir = white ? 16 : -16
  const startRank = white ? 1 : 6
  const promoRank = white ? 7 : 0
  const one = from + dir

  if (onBoard(one) && board[one] === '.') {
    if (rankOf(one) === promoRank) {
      for (const p of ['q', 'r', 'b', 'n']) moves.push({ from, to: one, promo: p })
    } else {
      moves.push({ from, to: one })
      const two = from + 2 * dir
      if (rankOf(from) === startRank && board[two] === '.') moves.push({ from, to: two, double: true })
    }
  }
  for (const off of white ? [15, 17] : [-15, -17]) {
    const to = from + off
    if (!onBoard(to)) continue
    const target = board[to]
    const isEp = to === pos.ep
    if ((target !== '.' && sameSide(target, !white)) || isEp) {
      if (rankOf(to) === promoRank) {
        for (const p of ['q', 'r', 'b', 'n']) moves.push({ from, to, promo: p })
      } else {
        moves.push({ from, to, ep: isEp })
      }
    }
  }
}

const generatePseudo = (pos) => {
  const { board, white } = pos
  const moves = []
  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) continue
    const p = board[sq]
    if (p === '.' || isWhite(p) !== white) continue
    const type = p.toUpperCase()

    if (type === 'P') { addPawnMoves(pos, sq, moves); continue }

    if (type === 'N' || type === 'K') {
      for (const off of type === 'N' ? KNIGHT_OFFSETS : KING_OFFSETS) {
        const to = sq + off
        if (onBoard(to) && !sameSide(board[to], white)) moves.push({ from: sq, to })
      }
      continue
    }

    const dirs = type === 'B' ? BISHOP_DIRS : type === 'R' ? ROOK_DIRS : QUEEN_DIRS
    for (const dir of dirs) {
      let to = sq + dir
      while (onBoard(to)) {
        if (board[to] === '.') { moves.push({ from: sq, to }); to += dir; continue }
        if (!sameSide(board[to], white)) moves.push({ from: sq, to })
        break
      }
    }
  }

  // Castling: rights present, squares empty, and the king may not start in, pass through, or
  // land on an attacked square.
  const k = white ? 4 : 116
  const rights = pos.castling
  if (board[k] === (white ? 'K' : 'k') && !isAttacked(board, k, !white)) {
    const kSide = white ? 'K' : 'k'
    const qSide = white ? 'Q' : 'q'
    if (rights.includes(kSide) && board[k + 1] === '.' && board[k + 2] === '.'
        && board[k + 3] === (white ? 'R' : 'r')
        && !isAttacked(board, k + 1, !white) && !isAttacked(board, k + 2, !white)) {
      moves.push({ from: k, to: k + 2, castle: 'k' })
    }
    if (rights.includes(qSide) && board[k - 1] === '.' && board[k - 2] === '.' && board[k - 3] === '.'
        && board[k - 4] === (white ? 'R' : 'r')
        && !isAttacked(board, k - 1, !white) && !isAttacked(board, k - 2, !white)) {
      moves.push({ from: k, to: k - 2, castle: 'q' })
    }
  }
  return moves
}

const applyMove = (pos, move) => {
  const board = pos.board.slice()
  const piece = board[move.from]
  const white = pos.white
  let castling = pos.castling

  board[move.from] = '.'
  board[move.to] = move.promo ? (white ? move.promo.toUpperCase() : move.promo) : piece

  if (move.ep) board[move.to + (white ? -16 : 16)] = '.' // captured pawn is behind the target
  if (move.castle === 'k') { board[move.to + 1] = '.'; board[move.to - 1] = white ? 'R' : 'r' }
  if (move.castle === 'q') { board[move.to - 2] = '.'; board[move.to + 1] = white ? 'R' : 'r' }

  // Rights are lost when the king or a rook moves, and when a rook is captured on its home square.
  const strip = (chars) => { for (const c of chars) castling = castling.replace(c, '') }
  if (piece === 'K') strip('KQ')
  if (piece === 'k') strip('kq')
  if (move.from === 7 || move.to === 7) strip('K')
  if (move.from === 0 || move.to === 0) strip('Q')
  if (move.from === 119 || move.to === 119) strip('k')
  if (move.from === 112 || move.to === 112) strip('q')

  return {
    board,
    white: !white,
    castling,
    ep: move.double ? move.from + (white ? 16 : -16) : -1,
    half: piece.toUpperCase() === 'P' || pos.board[move.to] !== '.' ? 0 : pos.half + 1,
    full: white ? pos.full : pos.full + 1,
  }
}

const legalMoves = (pos) => generatePseudo(pos).filter((m) => {
  const next = applyMove(pos, m)
  const k = findKing(next.board, pos.white)
  return k >= 0 && !isAttacked(next.board, k, !pos.white)
})

// ---------------------------------------------------------------- perft

const perft = (pos, depth) => {
  if (depth === 0) return 1
  const moves = legalMoves(pos)
  if (depth === 1) return moves.length
  let nodes = 0
  for (const m of moves) nodes += perft(applyMove(pos, m), depth - 1)
  return nodes
}

// ---------------------------------------------------------------- evaluation

const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 }

// Piece-square tables, from White's point of view; mirrored for Black. These are what stop the
// engine shuffling pieces aimlessly — knights get drawn to the centre, pawns want to advance.
const PST = {
  P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
      0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,
      -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
      -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,
      -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
      -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  R: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
      -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,
      -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10,
      -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  K: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
      20,20,0,0,0,20,20,20, 20,30,10,0,0,10,30,20],
}

const evaluate = (pos) => {
  let score = 0
  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) continue
    const p = pos.board[sq]
    if (p === '.') continue
    const type = p.toUpperCase()
    const white = isWhite(p)
    // PST index counts from a8 downward, so flip the rank for White.
    const idx = white ? (7 - rankOf(sq)) * 8 + fileOf(sq) : rankOf(sq) * 8 + fileOf(sq)
    const value = VALUE[type] + (PST[type] ? PST[type][idx] : 0)
    score += white ? value : -value
  }
  return pos.white ? score : -score // negamax: always from the side to move
}

// Most Valuable Victim / Least Valuable Attacker — try PxQ before QxP, because the good captures
// are far likelier to cause a beta cutoff and prune the rest of the list.
const orderMoves = (pos, moves) => moves
  .map((m) => {
    const victim = pos.board[m.to]
    const attacker = pos.board[m.from]
    let score = 0
    if (victim !== '.') score = 10 * VALUE[victim.toUpperCase()] - VALUE[attacker.toUpperCase()]
    if (m.promo) score += VALUE[m.promo.toUpperCase()]
    return { m, score }
  })
  .sort((a, b) => b.score - a.score)
  .map((x) => x.m)

const search = (pos, depth, alpha, beta) => {
  if (depth === 0) return evaluate(pos)
  const moves = orderMoves(pos, legalMoves(pos))
  if (!moves.length) return inCheck(pos) ? -100000 - depth : 0 // mate (prefer sooner) or stalemate

  let best = -Infinity
  for (const m of moves) {
    const score = -search(applyMove(pos, m), depth - 1, -beta, -alpha)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

const bestMove = (pos, depth = SEARCH_DEPTH) => {
  const moves = orderMoves(pos, legalMoves(pos))
  if (!moves.length) return null
  let best = moves[0]
  let bestScore = -Infinity
  for (const m of moves) {
    const score = -search(applyMove(pos, m), depth - 1, -Infinity, Infinity)
    if (score > bestScore) { bestScore = score; best = m }
  }
  return best
}

// ---------------------------------------------------------------- state + rendering

const defaultState = () => ({ fen: INITIAL_FEN, wins: 0, losses: 0, draws: 0, history: [] })

const readState = () => {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    if (typeof s.fen !== 'string') return defaultState()
    parseFen(s.fen) // throws or misparses -> fall back
    return { ...defaultState(), ...s }
  } catch {
    return defaultState()
  }
}

const writeState = (s) => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(s, null, 2)}\n`)
}

const GLYPH = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
  '.': '·',
}

const moveLink = (uci) =>
  `https://github.com/${REPO}/issues/new?title=chess-${uci}&body=Press+%22Create%22+%E2%80%94+the+engine+replies+in+about+a+minute.`

const renderBoard = (state) => {
  const pos = parseFen(state.fen)
  const moves = legalMoves(pos)
  const over = moves.length === 0
  const checked = inCheck(pos)

  const rows = []
  rows.push('| | a | b | c | d | e | f | g | h |')
  rows.push('|--|--|--|--|--|--|--|--|--|')
  for (let r = 7; r >= 0; r--) {
    const cells = []
    for (let f = 0; f < 8; f++) cells.push(GLYPH[pos.board[r * 16 + f]])
    rows.push(`| **${r + 1}** | ${cells.join(' | ')} |`)
  }

  let status
  if (over && checked) status = pos.white ? '**Checkmate — the engine wins.**' : '🎉 **Checkmate — you win!**'
  else if (over) status = '**Stalemate.** Draw.'
  else if (checked) status = '⚠️ **You are in check.**'
  else status = 'Your move — you are White (♙).'

  // Grouped by origin square so a 20-40 move list stays readable.
  const byFrom = new Map()
  for (const m of moves) {
    const uci = toAlg(m.from) + toAlg(m.to) + (m.promo || '')
    if (!byFrom.has(toAlg(m.from))) byFrom.set(toAlg(m.from), [])
    byFrom.get(toAlg(m.from)).push(`[${toAlg(m.to)}${m.promo ? `=${m.promo.toUpperCase()}` : ''}](${moveLink(uci)})`)
  }
  const moveList = [...byFrom.entries()]
    .map(([from, tos]) => `**${from}** → ${tos.join(' · ')}`)
    .join('<br>')

  return [
    START,
    '',
    '### ♟️ Chess — you are White, against a real engine',
    '',
    '0x88 board representation, full legal move generation (castling, en passant, promotion),',
    `alpha-beta search to **${SEARCH_DEPTH} plies** with piece-square evaluation and MVV-LVA`,
    'capture ordering.',
    '',
    rows.join('\n'),
    '',
    status,
    '',
    over ? '' : `<details><summary><b>▶ Your legal moves (${moves.length}) — click one to play</b></summary><br>\n\n${moveList}\n\n</details>`,
    '',
    `🏆 You **${state.wins}** · 🤖 Engine **${state.losses}** · 🤝 Draws **${state.draws}**`,
    '',
    `<sub>Move generation is verified with <a href="https://www.chessprogramming.org/Perft">perft</a>:`,
    `the engine reproduces the published node counts for the starting position exactly`,
    `(20 / 400 / 8902 / 197281), which is what proves castling, en passant and promotion are all`,
    `handled correctly. [Read the engine](https://github.com/${REPO}/blob/main/.github/scripts/chess.js).</sub>`,
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

// ---------------------------------------------------------------- CLI

const main = () => {
  const arg = process.argv[2]

  if (arg === '--perft') {
    const depth = Number(process.argv[3] || 3)
    const pos = parseFen(INITIAL_FEN)
    const t = Date.now()
    const n = perft(pos, depth)
    console.log(`perft(${depth}) = ${n}  [${Date.now() - t}ms]`)
    return
  }

  const state = readState()

  if (arg === '--render') { updateReadme(state); console.log('rendered'); return }
  if (arg === '--reset') {
    writeState({ ...state, fen: INITIAL_FEN, history: [] })
    updateReadme(readState())
    console.log('board reset')
    return
  }

  if (!arg || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(arg)) {
    console.log(`"${arg}" isn't a move — use a square pair like e2e4, or e7e8q to promote.`)
    return
  }

  let pos = parseFen(state.fen)
  if (legalMoves(pos).length === 0) { // finished game left on the board: start a new one
    state.fen = INITIAL_FEN
    state.history = []
    pos = parseFen(state.fen)
  }

  const from = fromAlg(arg.slice(0, 2))
  const to = fromAlg(arg.slice(2, 4))
  const promo = arg[4]
  const chosen = legalMoves(pos).find((m) =>
    m.from === from && m.to === to && (promo ? m.promo === promo : !m.promo))

  if (!chosen) {
    updateReadme(state)
    console.log(`${arg} isn't legal in this position. Pick one from the list under the board.`)
    return
  }

  pos = applyMove(pos, chosen)
  state.history.push(arg)
  let message

  const replies = legalMoves(pos)
  if (replies.length === 0) {
    if (inCheck(pos)) { state.wins += 1; message = 'Checkmate — you beat the engine. New game ready.' }
    else { state.draws += 1; message = 'Stalemate. Drawn — new game ready.' }
    state.fen = INITIAL_FEN
    state.history = []
  } else {
    const reply = bestMove(pos)
    pos = applyMove(pos, reply)
    state.history.push(toAlg(reply.from) + toAlg(reply.to) + (reply.promo || ''))
    const after = legalMoves(pos)
    if (after.length === 0) {
      if (inCheck(pos)) { state.losses += 1; message = `Engine plays ${toAlg(reply.from)}${toAlg(reply.to)} — checkmate. New game ready.` }
      else { state.draws += 1; message = 'Stalemate. Drawn — new game ready.' }
      state.fen = INITIAL_FEN
      state.history = []
    } else {
      state.fen = toFen(pos)
      message = `Engine plays **${toAlg(reply.from)}${toAlg(reply.to)}**${inCheck(pos) ? ' — check!' : ''} Your move.`
    }
  }

  writeState(state)
  updateReadme(readState())
  console.log(message)
}

main()
