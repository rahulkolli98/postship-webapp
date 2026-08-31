"use client";

import { useEffect, useRef } from "react";
import { initPaddle } from "../lib/paddle";

/**
 * PaddleInit — TASK-061.
 *
 * Kicks off Paddle.js initialization once per page load (signed-in app
 * only, mounted from the (app) layout). Renders nothing; a missing
 * NEXT_PUBLIC_PADDLE_CLIENT_TOKEN makes it a permanent no-op. Checkout
 * code (TASK-062) awaits initPaddle()/getPaddle() before opening.
 */
export function PaddleInit() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    void initPaddle();
  }, []);

  return null;
}
