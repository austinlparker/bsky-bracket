import { QueryParams } from "../lexicon/types/app/bsky/feed/getFeedSkeleton.ts";
import { AppContext } from "../config.ts";
import * as bracket from "./bracket.ts";

export interface UserContext {
  did: string;
  team: number;
}

type AlgoHandler = (
  ctx: AppContext,
  params: QueryParams,
  userContext: UserContext,
) => Promise<{
  cursor?: string;
  feed: { post: string }[];
}>;

const algos: Record<string, AlgoHandler> = {
  [bracket.shortname]: bracket.handler,
};

export default algos;
