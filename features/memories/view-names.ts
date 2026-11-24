import type { View } from "@/server/bridge/protocol.ts"

export const VIEW_NAMES: Record<View, string> = {
  active: "Active",
  archived: "Archived",
  expired: "Expired",
}
