import path from "path";
import dotenv from "dotenv";
dotenv.config();
import { createDatabase } from "../src/db/schema.js";
import { getPostPerformanceTool } from "../src/tools/post-performance.js";

const db = createDatabase(path.resolve("marketing-agent.db"));
console.log(getPostPerformanceTool(db, "carephoto", 5));
db.close();
