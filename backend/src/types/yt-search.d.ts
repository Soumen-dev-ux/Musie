declare module 'yt-search' {
  export interface YtsVideo {
    videoId: string;
    title: string;
    url?: string;
    thumbnail?: string;
    seconds?: number;
    timestamp?: string;
    views?: number;
    author?: {
      name?: string;
      url?: string;
    };
  }

  export interface YtsSearchResult {
    videos: YtsVideo[];
  }

  function yts(query: string): Promise<YtsSearchResult>;
  export default yts;
}
