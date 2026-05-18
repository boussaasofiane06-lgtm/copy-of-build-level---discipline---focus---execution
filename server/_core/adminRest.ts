import type { Express, NextFunction, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import { verifyAdminRequest } from "./adminAuth";
import type { TrpcContext } from "./context";

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toRequiredNumber(value: unknown, fallback = 0): number {
  return toNumber(value) ?? fallback;
}

function createCaller(req: Request, res: Response) {
  const ctx: TrpcContext = { req: req as TrpcContext["req"], res: res as TrpcContext["res"], user: null };
  return appRouter.createCaller(ctx);
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (await verifyAdminRequest(req)) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

function handleError(error: unknown, res: Response) {
  const message = error instanceof Error ? error.message : "Request failed";
  if (error instanceof TRPCError) {
    const status =
      error.code === "UNAUTHORIZED" ? 401 :
      error.code === "NOT_FOUND" ? 404 :
      error.code === "BAD_REQUEST" ? 400 :
      error.code === "PRECONDITION_FAILED" ? 412 :
      500;
    res.status(status).json({ error: message });
    return;
  }
  res.status(500).json({ error: message });
}

function normalizeProduct(body: Record<string, unknown>) {
  return {
    ...body,
    price: toRequiredNumber(body.price),
    compareAtPrice: toNumber(body.compareAtPrice),
    sortOrder: toRequiredNumber(body.sortOrder),
  };
}

function normalizeDigitalProduct(body: Record<string, unknown>) {
  return {
    ...body,
    price: toRequiredNumber(body.price),
  };
}

function normalizeAffiliateProduct(body: Record<string, unknown>) {
  return {
    ...body,
    price: toNumber(body.price),
  };
}

function normalizeMembershipTier(body: Record<string, unknown>) {
  return {
    ...body,
    price: toRequiredNumber(body.price),
  };
}

export function registerAdminRestRoutes(app: Express) {
  const protectedRoute = (handler: AsyncRoute) =>
    asyncRoute(async (req, res, next) => {
      if (!(await requireAdmin(req, res))) return;
      await handler(req, res, next);
    });

  // Admin panel REST bridge. The React admin UI uses /api/admin/* REST calls,
  // while the root server stores the implementation in tRPC routers.
  app.get("/api/admin/products", protectedRoute(async (req, res) => {
    res.json(await createCaller(req, res).admin.listProducts());
  }));
  app.post("/api/admin/products", protectedRoute(async (req, res) => {
    const result = await createCaller(req, res).admin.createProduct(normalizeProduct(req.body) as any);
    res.json(result);
  }));
  app.put("/api/admin/products/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).admin.updateProduct({ id: Number(req.params.id), data: normalizeProduct(req.body) as any });
    res.json({ success: true });
  }));
  app.delete("/api/admin/products/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).admin.deleteProduct({ id: Number(req.params.id) });
    res.json({ success: true });
  }));

  app.get("/api/admin/blog", protectedRoute(async (req, res) => {
    res.json(await createCaller(req, res).blog.adminList());
  }));
  app.post("/api/admin/blog", protectedRoute(async (req, res) => {
    await createCaller(req, res).blog.adminCreate(req.body as any);
    res.json({ success: true, id: 0 });
  }));
  app.put("/api/admin/blog/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).blog.adminUpdate({ id: Number(req.params.id), ...req.body } as any);
    res.json({ success: true });
  }));
  app.delete("/api/admin/blog/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).blog.adminDelete({ id: Number(req.params.id) });
    res.json({ success: true });
  }));

  app.get("/api/admin/digital", protectedRoute(async (req, res) => {
    res.json(await createCaller(req, res).digital.adminList());
  }));
  app.post("/api/admin/digital", protectedRoute(async (req, res) => {
    await createCaller(req, res).digital.adminCreate(normalizeDigitalProduct(req.body) as any);
    res.json({ success: true, id: 0 });
  }));
  app.put("/api/admin/digital/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).digital.adminUpdate({ id: Number(req.params.id), ...normalizeDigitalProduct(req.body) } as any);
    res.json({ success: true });
  }));
  app.delete("/api/admin/digital/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).digital.adminDelete({ id: Number(req.params.id) });
    res.json({ success: true });
  }));

  app.get("/api/admin/videos", protectedRoute(async (req, res) => {
    res.json(await createCaller(req, res).aiVideos.adminList());
  }));
  app.post("/api/admin/videos", protectedRoute(async (req, res) => {
    await createCaller(req, res).aiVideos.adminCreate(req.body as any);
    res.json({ success: true });
  }));
  app.put("/api/admin/videos/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).aiVideos.adminUpdate({ id: Number(req.params.id), ...req.body } as any);
    res.json({ success: true });
  }));
  app.delete("/api/admin/videos/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).aiVideos.adminDelete({ id: Number(req.params.id) });
    res.json({ success: true });
  }));

  app.get("/api/admin/affiliate", protectedRoute(async (req, res) => {
    res.json(await createCaller(req, res).affiliate.adminList());
  }));
  app.post("/api/admin/affiliate", protectedRoute(async (req, res) => {
    await createCaller(req, res).affiliate.adminCreate(normalizeAffiliateProduct(req.body) as any);
    res.json({ success: true });
  }));
  app.put("/api/admin/affiliate/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).affiliate.adminUpdate({ id: Number(req.params.id), ...normalizeAffiliateProduct(req.body) } as any);
    res.json({ success: true });
  }));
  app.delete("/api/admin/affiliate/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).affiliate.adminDelete({ id: Number(req.params.id) });
    res.json({ success: true });
  }));

  app.get("/api/admin/membership", protectedRoute(async (req, res) => {
    res.json(await createCaller(req, res).membership.adminList());
  }));
  app.post("/api/admin/membership", protectedRoute(async (req, res) => {
    await createCaller(req, res).membership.adminCreate(normalizeMembershipTier(req.body) as any);
    res.json({ success: true });
  }));
  app.put("/api/admin/membership/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).membership.adminUpdate({ id: Number(req.params.id), ...normalizeMembershipTier(req.body) } as any);
    res.json({ success: true });
  }));
  app.delete("/api/admin/membership/:id", protectedRoute(async (req, res) => {
    await createCaller(req, res).membership.adminDelete({ id: Number(req.params.id) });
    res.json({ success: true });
  }));

  app.get("/api/admin/settings", protectedRoute(async (req, res) => {
    res.json(await createCaller(req, res).admin.getSettings());
  }));
  app.post("/api/admin/settings", protectedRoute(async (req, res) => {
    await createCaller(req, res).admin.bulkSetSettings(req.body as any);
    res.json({ success: true });
  }));

  app.get("/api/admin/ai-chat/config", protectedRoute(async (req, res) => {
    res.json(await createCaller(req, res).integrations.getAIChatConfig());
  }));
  app.post("/api/admin/ai-chat/config", protectedRoute(async (req, res) => {
    await createCaller(req, res).integrations.updateAIChatConfig(req.body as any);
    res.json({ success: true });
  }));
  app.get("/api/admin/ai-chat/sessions", protectedRoute(async (req, res) => {
    const limit = toRequiredNumber(req.query.limit, 50);
    const sessions = await createCaller(req, res).integrations.listChatSessions({ limit });
    res.json({ sessions });
  }));
  app.get("/api/admin/ai-chat/sessions/:sessionId", protectedRoute(async (req, res) => {
    const messages = await createCaller(req, res).integrations.getChatSession({ sessionId: req.params.sessionId });
    res.json({ messages });
  }));

  app.get("/api/chat/config", asyncRoute(async (req, res) => {
    res.json(await createCaller(req, res).publicChat.getWidgetConfig());
  }));
  app.post("/api/chat/message", asyncRoute(async (req, res) => {
    const result = await createCaller(req, res).publicChat.sendMessage(req.body as any);
    res.json(result);
  }));

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    handleError(error, res);
  });
}
