declare global {
  const SWUST_CODE_VERSION: string
  const SWUST_CODE_CHANNEL: string
}

export const InstallationVersion = typeof SWUST_CODE_VERSION === "string" ? SWUST_CODE_VERSION : "local"
export const InstallationChannel = typeof SWUST_CODE_CHANNEL === "string" ? SWUST_CODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
