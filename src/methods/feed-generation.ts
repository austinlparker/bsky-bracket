import { InvalidRequestError } from "@atproto/xrpc-server";
import { Server } from "../lexicon/index.ts";
import { AppContext } from "../config.ts";
import algos from "../algos/index.ts";
import { validateAuth } from "../auth.ts";
import { AtUri } from "@atproto/syntax";
import { determineTeamHash } from "../util/teams.ts";

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
    const feedUri = new AtUri(params.feed);
    const algo = algos[feedUri.rkey];
    if (
      feedUri.hostname !== ctx.cfg.publisherDid ||
      feedUri.collection !== "app.bsky.feed.generator" ||
      !algo
    ) {
      throw new InvalidRequestError(
        "Unsupported algorithm",
        "UnsupportedAlgorithm",
      );
    }

    const requesterDid = await validateAuth(
      req,
      ctx.cfg.serviceDid,
      ctx.didResolver,
    );

    const team = determineTeamHash(requesterDid);

    const body = await algo(ctx, params, {
      did: requesterDid,
      team: team,
    });
    return {
      encoding: "application/json",
      body: body,
    };
  });
}
