import {
  adminKeys,
  approvalKeys,
  assetKeys,
  authKeys,
  dashboardKeys,
  notificationKeys,
  reportKeys,
  ticketKeys,
} from './queryKeys.js'

async function invalidate(queryClient, queryKeys) {
  await Promise.all(
    queryKeys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, refetchType: 'active' }),
    ),
  )
}

export function ticketMutationInvalidationKeys(ticketId) {
  return [
    ticketKeys.detail(ticketId),
    ticketKeys.lists(),
    ticketKeys.queues(),
    dashboardKeys.all,
    notificationKeys.all,
    reportKeys.all,
  ]
}

export function assetMutationInvalidationKeys(assetId) {
  return [
    assetKeys.detail(assetId),
    assetKeys.lists(),
    dashboardKeys.all,
    notificationKeys.all,
    reportKeys.all,
  ]
}

export async function invalidateAfterTicketMutation(queryClient, ticketId) {
  await invalidate(queryClient, ticketMutationInvalidationKeys(ticketId))
}

export async function invalidateAfterAssetMutation(queryClient, assetId) {
  await invalidate(queryClient, assetMutationInvalidationKeys(assetId))
}

export async function invalidateAfterApprovalMutation(queryClient, ticketId) {
  await invalidate(queryClient, [
    approvalKeys.all,
    ticketKeys.detail(ticketId),
    dashboardKeys.all,
    notificationKeys.all,
    reportKeys.all,
  ])
}

export async function invalidateAfterNotificationMutation(queryClient) {
  await invalidate(queryClient, [notificationKeys.all, dashboardKeys.all])
}

export async function invalidateAfterAccessGrantMutation(queryClient) {
  await invalidate(queryClient, [
    adminKeys.accessGrants(),
    authKeys.me(),
    dashboardKeys.all,
  ])
}
