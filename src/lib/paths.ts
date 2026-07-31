import path from "node:path";

const appRoot = process.cwd();
const workspaceRoot = path.resolve(appRoot, "..");

export const paths = {
  appRoot,
  workspaceRoot,
  baseData:
    process.env.LENNY_BASE_DATA_DIR ||
    path.join(workspaceRoot, "lennys-podcast-newsletter-main"),
  starterData:
    process.env.LENNY_STARTER_DATA_DIR ||
    path.join(workspaceRoot, "lennys-newsletterpodcastdata-main"),
  transcripts:
    process.env.LENNY_TRANSCRIPTS_DIR ||
    path.join(workspaceRoot, "lennys-podcast-transcripts-main"),
  database:
    process.env.LENNY_DB_PATH || path.join(appRoot, "data", "lenny-hub.db"),
};
