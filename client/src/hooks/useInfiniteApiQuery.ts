import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";

export function useInfiniteApiQuery<TData>(
  queryKey: QueryKey,
  queryFn: any,
  getNextPageParam: any
) {
  return useInfiniteQuery({
    queryKey,
    queryFn,
    initialPageParam: 1,
    getNextPageParam,
  });
}
