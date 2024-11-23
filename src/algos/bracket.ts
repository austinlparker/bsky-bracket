import { QueryParams } from "../lexicon/types/app/bsky/feed/getFeedSkeleton";
import { AppContext } from "../config";

export const shortname = "bracket-feed";

interface UserContext {
  did: string;
  team: number;
}

export const handler = async (
  ctx: AppContext,
  params: QueryParams,
  user: UserContext,
) => {
  const timeStr = params.cursor
    ? new Date(parseInt(params.cursor, 10)).toISOString()
    : new Date().toISOString();

  try {
    // Check if there's a current game and if the user is participating
    const userGameStatus = await ctx.db
      .selectFrom("user")
      .select("currentGameId")
      .where("did", "=", user.did)
      .executeTakeFirst();

    // Base query for all posts from the user's team
    let query = ctx.db
      .selectFrom("post")
      .select([
        "post.uri",
        "post.indexedAt",
        "post.likeCount",
        "post.gameId",
        "post.roundId",
      ])
      .where("post.team", "=", user.team)
      .where("post.indexedAt", "<", timeStr)
      .where("post.active", "=", true);

    if (userGameStatus?.currentGameId) {
      // User is in a game - prioritize game content
      query = query.orderBy(
        (eb) => [
          eb
            .case()
            .when("post.gameId", "=", userGameStatus.currentGameId)
            .then(1)
            .else(0)
            .end(),
          "post.likeCount",
          "post.indexedAt",
        ],
        ["desc", "desc", "desc"],
      );

      // Only show posts from active participants in the current round
      query = query.where((eb) =>
        eb.or([
          // Include posts from current game's active participants
          eb.and([
            eb("post.gameId", "=", userGameStatus.currentGameId),
            eb.or([
              // Either the post is not in a round
              eb("post.roundId", "is", null),
              // Or the participant is still active in the round
              eb.and([eb("round_participant.status", "=", "active")]),
            ]),
          ]),
          // Or include non-game posts
          eb("post.gameId", "is", null),
        ]),
      );
    } else {
      // User is not in a game - show all team posts with simple ordering
      query = query.orderBy([
        { ref: "post.likeCount", direction: "desc" },
        { ref: "post.indexedAt", direction: "desc" },
      ]);
    }

    const posts = await query.limit(params.limit).execute();

    ctx.logger.debug("Feed generated", {
      userId: user.did,
      team: user.team,
      currentGame: userGameStatus?.currentGameId,
      postCount: posts.length,
      firstPostTime: posts[0]?.indexedAt,
      lastPostTime: posts[posts.length - 1]?.indexedAt,
    });

    return {
      cursor:
        posts.length > 0
          ? new Date(posts[posts.length - 1].indexedAt).getTime().toString()
          : undefined,
      feed: posts.map((row) => ({
        post: row.uri,
      })),
    };
  } catch (error) {
    ctx.logger.error("Error generating feed:", {
      error: error instanceof Error ? error.message : String(error),
      userId: user.did,
      team: user.team,
    });
    throw error;
  }
};
