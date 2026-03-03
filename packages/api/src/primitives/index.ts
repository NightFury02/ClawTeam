/**
 * Primitives Module - 原语模块
 *
 * 导出原语服务和相关类型
 *
 * ## 稳定性说明
 *
 * - **L0 Foundation Layer**: 稳定 (Stable)
 * - **L1 Standard Layer**: 稳定 (Stable)
 * - **L2 Advanced Layer**: 实验性 (Experimental)
 * - **L3 Enterprise Layer**: 实验性 (Experimental)
 *
 * 推荐使用 L0 + L1 原语构建应用。L2/L3 原语可能在未来版本中变更。
 */

export * from './interface';
export * from './service';
export { createPrimitiveRoutes, type PrimitiveRoutesDeps } from './routes';

// === Core Primitives (Stable) ===
export { L0Primitives } from './l0-primitives';
export { L1Primitives } from './l1-primitives';

// === Experimental Primitives (Unstable, may change) ===
/**
 * @experimental L2 Advanced Layer primitives are experimental.
 * API may change in future versions without notice.
 */
export { L2Primitives } from './l2-primitives';

/**
 * @experimental L3 Enterprise Layer primitives are experimental.
 * These may be moved to a separate enterprise package in the future.
 */
export { L3Primitives } from './l3-primitives';
