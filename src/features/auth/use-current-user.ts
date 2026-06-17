"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, API_USER_SCOPE, userPath } from "@/features/api/client";
import { queryKeys } from "@/features/api/query-keys";
import { User } from "@/features/api/types";

type CurrentUserData = {
  user: User;
};

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: async () => {
      const data = await apiFetch<CurrentUserData>(
        userPath(API_USER_SCOPE, "/me"),
      );
      return data.user;
    },
  });
}
