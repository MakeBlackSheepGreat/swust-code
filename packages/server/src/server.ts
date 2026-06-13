/**
 * Server entry point for the `serve` command.
 * Wraps the internal server module with a simple HTTP server.
 */

import { Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { createServer } from "node:http"
import { routes } from "./routes"

export interface Listener {
  readonly hostname: string
  readonly port: number
  readonly stop: () => Promise<void>
}

export namespace Server {
  export interface ListenOptions {
    readonly port?: number
    readonly hostname?: string
    readonly password?: string
  }

  export async function listen(opts: ListenOptions = {}): Promise<Listener> {
    const port = opts.port ?? 4096
    const hostname = opts.hostname ?? "127.0.0.1"

    const handler = HttpRouter.toWebHandler(
      routes.pipe(Layer.provide(HttpServer.layerServices)),
      { disableLogger: true },
    )

    const handlerFn = handler as unknown as (req: Request) => Promise<Response>
    const httpServer = createServer((req: any, res: any) => {
      handlerFn(req as unknown as Request).then((response: any) => {
        res.writeHead(response.status, Object.fromEntries(response.headers))
        if (response.body) {
          const reader = response.body.getReader()
          const pump = () => {
            reader.read().then(({ done, value }: any) => {
              if (done) {
                res.end()
                return
              }
              res.write(value)
              pump()
            })
          }
          pump()
        } else {
          res.end()
        }
      }).catch((err: any) => {
        res.writeHead(500)
        res.end(String(err))
      })
    })

    return new Promise((resolve) => {
      httpServer.listen(port, hostname, () => {
        resolve({
          hostname,
          port,
          stop: () => new Promise((r) => httpServer.close(() => r())),
        })
      })
    })
  }
}
