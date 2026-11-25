/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/player`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}` | `/`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/library` | `/library`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/search` | `/search`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/settings` | `/settings`; params?: Router.UnknownInputParams; } | { pathname: `/playlist/[id]`, params: Router.UnknownInputParams & { id: string | number; } };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/player`; params?: Router.UnknownOutputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}` | `/`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/library` | `/library`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/search` | `/search`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/settings` | `/settings`; params?: Router.UnknownOutputParams; } | { pathname: `/playlist/[id]`, params: Router.UnknownOutputParams & { id: string; } };
      href: Router.RelativePathString | Router.ExternalPathString | `/player${`?${string}` | `#${string}` | ''}` | `/_sitemap${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}${`?${string}` | `#${string}` | ''}` | `/${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/library${`?${string}` | `#${string}` | ''}` | `/library${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/search${`?${string}` | `#${string}` | ''}` | `/search${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/settings${`?${string}` | `#${string}` | ''}` | `/settings${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString | Router.ExternalPathString | `/player` | `/_sitemap` | `${'/(tabs)'}` | `/` | `${'/(tabs)'}/library` | `/library` | `${'/(tabs)'}/search` | `/search` | `${'/(tabs)'}/settings` | `/settings`; params?: Router.UnknownInputParams; } | `/playlist/${Router.SingleRoutePart<T>}` | { pathname: `/playlist/[id]`, params: Router.UnknownInputParams & { id: string | number; } };
    }
  }
}
