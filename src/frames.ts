// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 WittyWilla and contributors
// Reads server-sent events out of the pieces a fetch hands over. A piece can end anywhere,
// even inside a character, so what's incomplete waits for the next one.
export type Frame = { event: string; data: string }

export class FrameReader {
  private text = new TextDecoder()
  private buffer = ''

  push(bytes: Uint8Array): Frame[] {
    this.buffer += this.text.decode(bytes, { stream: true })
    const out: Frame[] = []
    for (;;) {
      const lf = this.buffer.indexOf('\n\n')
      const crlf = this.buffer.indexOf('\r\n\r\n')
      const end = lf >= 0 && (crlf < 0 || lf < crlf) ? lf : crlf
      if (end < 0) return out
      const frame = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + (end === crlf ? 4 : 2))
      let event = 'message', data = ''
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).replace(/^ /, '')
      }
      if (data) out.push({ event, data }) // a line of only a comment keeps the connection awake
    }
  }
}

// How long before trying again: it grows, up to half a minute, so a server having a bad time
// isn't pestered.
export const retryWait = (attempt: number) => Math.min(30000, 1000 * 2 ** Math.min(attempt, 5))
