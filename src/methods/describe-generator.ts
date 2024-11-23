import { Server } from "../lexicon/index.ts";
import { AppContext } from "../config.ts";
import algos from "../algos/index.ts";
import { AtUri } from "@atproto/syntax";

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.describeFeedGenerator(async () => {
    const feeds = Object.keys(algos).map((shortname) => ({
      uri: AtUri.make(
        ctx.cfg.publisherDid,
        "app.bsky.feed.generator",
        shortname,
      ).toString(),
    }));
    return {
      encoding: "application/json",
      body: {
        did: ctx.cfg.serviceDid,
        feeds,
      },
    };
  });
}
