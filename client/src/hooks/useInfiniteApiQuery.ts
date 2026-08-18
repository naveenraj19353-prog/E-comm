import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";

export function useInfiniteApiQuery<TData>(
  queryKey: QueryKey,
  queryFn: (pageParam: number) => Promise<TData>,
  getNextPageParam: (lastPage: TData, allPages: TData[]) => number | undefined,
) {
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => queryFn(pageParam),
    initialPageParam: 1,
    getNextPageParam,
  });
}
