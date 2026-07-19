import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

// Collaboration mutations invalidate through these hooks so components never
// hand-write query keys. TanStack Query matches keys by prefix, so
// ["users", userId, "teams"] also covers team detail, members, agents, and
// audit keys for every team.
export function useTeamInvalidation(userId: string) {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.teams(userId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.teamInvites(userId),
    });
  };
}

export function useFriendInvalidation(userId: string) {
  const queryClient = useQueryClient();

  return () => {
    // queryKeys.friends(userId) ends with a filters object; the three-segment
    // prefix matches every filtered variant.
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.user(userId), "friends"],
    });
  };
}
