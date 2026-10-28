/**
 * Cloudflare Workers entrypoint for the OSRS Hub combat runtime.
 *
 * The calculator and canonical data are bundled from this repository; no
 * client-supplied equipment bonuses are trusted by the calculation core.
 */
import { handleOsrsHubRuntimeRequest } from './http-handler';

export interface OsrsHubWorkerEnvironment {
  ALLOWED_ORIGIN?: string;
}

const worker = {
  fetch(request: Request, env: OsrsHubWorkerEnvironment): Promise<Response> {
    return handleOsrsHubRuntimeRequest(request, env);
  },
};

export default worker;
