// The branch the admin app is working at. The server answers each request with
// the role the user holds at that branch, so it goes with every call. It's
// kept in localStorage so the same admin comes back to the same branch.
export const ACTIVE_BRANCH_KEY = 'com-mart-active-branch'
export const BRANCH_HEADER = 'X-Branch-Id'

export function storedActiveBranch(): number | null {
  try {
    return Number(localStorage.getItem(ACTIVE_BRANCH_KEY)) || null
  } catch {
    return null
  }
}
