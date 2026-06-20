const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://swust-code.dev" : `https://${stage}.swust-code.dev`,
  console: "https://opencode.ai/auth",
  email: "contact@swust-code.dev",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/MakeBlackSheepGreat/swust-code",
  discord: "https://swust-code.dev/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
