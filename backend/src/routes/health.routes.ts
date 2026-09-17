import { Router } from "express";
import { getDeliveryProfile } from "../services/email.service";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "mailflow-api",
    delivery: getDeliveryProfile(),
  });
});

export default router;