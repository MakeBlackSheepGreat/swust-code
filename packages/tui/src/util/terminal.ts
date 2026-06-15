export function isMacNativeTerminal(input?: { platform?: NodeJS.Platform; termProgram?: string }) {
  return (
    (input?.platform ?? process.platform) === "darwin" &&
    (input?.termProgram ?? process.env.TERM_PROGRAM) === "Apple_Terminal"
  )
}

export function isPlainTerminal(input?: { platform?: NodeJS.Platform; termProgram?: string; plain?: string }) {
  const plain = input?.plain ?? process.env.SWUST_CODE_TUI_PLAIN
  if (plain === "false" || plain === "0") return false
  if (plain === "true" || plain === "1") return true
  return isMacNativeTerminal(input)
}
