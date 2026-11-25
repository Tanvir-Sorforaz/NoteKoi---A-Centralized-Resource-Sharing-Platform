import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application } from "express";
import { config } from "./config/index.js";
import { globalErrorHandler } from "./middleware/globalErrorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { apiRouter } from "./routes/index.js";

const app: Application = express();

app.disable("x-powered-by");

// CORS: the Next.js app runs on WEB_ORIGIN and sends the httpOnly auth cookie.
app.use(cors({ origin: config.webOrigin, credentials: true }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

app.use(apiRouter);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
