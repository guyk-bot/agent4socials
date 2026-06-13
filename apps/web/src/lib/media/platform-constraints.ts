/**
 * Platform-specific media constraints for validation and conversion
 */

export interface MediaConstraints {
  images?: {
    maxSizeBytes: number;
    formats: string[];
    maxWidthPx?: number;
    maxHeightPx?: number;
    aspectRatioRange?: { min: number; max: number }; // width/height
    colorSpace?: 'sRGB' | 'any';
  };
  videos?: {
    maxSizeBytes: number;
    formats: string[];
    maxDurationSeconds?: number;
    codecs?: string[];
    audioCodecs?: string[];
    aspectRatioRange?: { min: number; max: number };
    maxWidthPx?: number;
    maxHeightPx?: number;
    moovAtomFirst?: boolean; // For MP4/MOV files
  };
  postLimits?: {
    maxPostsPerDay?: number;
    requiresDestinationUrl?: boolean; // Pinterest
    requiresCoverImage?: boolean; // Pinterest videos
    requiresBoardId?: boolean; // Pinterest
  };
}

/**
 * Complete platform constraints based on API documentation
 */
export const PLATFORM_MEDIA_CONSTRAINTS: Record<string, MediaConstraints> = {
  // Instagram
  instagram: {
    images: {
      maxSizeBytes: 8 * 1024 * 1024, // 8 MB
      formats: ['image/jpeg'], // Only JPEG, PNGs rejected
      colorSpace: 'sRGB',
    },
    videos: {
      maxSizeBytes: 300 * 1024 * 1024, // 300 MB for feed
      formats: ['video/mp4', 'video/quicktime'],
      codecs: ['h264', 'hevc'],
      audioCodecs: ['aac'],
      moovAtomFirst: true,
    },
  },

  // Instagram Stories/Reels (separate constraint)
  instagram_story: {
    videos: {
      maxSizeBytes: 100 * 1024 * 1024, // 100 MB for Stories/Reels
      formats: ['video/mp4', 'video/quicktime'],
      codecs: ['h264', 'hevc'],
      audioCodecs: ['aac'],
      moovAtomFirst: true,
      aspectRatioRange: { min: 9/16, max: 16/9 },
    },
  },

  // TikTok
  tiktok: {
    // No image posting API available
    videos: {
      maxSizeBytes: 1024 * 1024 * 1024, // 1 GB total (chunked 5-64 MB per chunk)
      formats: ['video/mp4'], // MP4 only
      maxDurationSeconds: 10 * 60, // 10 minutes via API
    },
  },

  // YouTube
  youtube: {
    // No image posting
    videos: {
      maxSizeBytes: 256 * 1024 * 1024 * 1024, // 256 GB
      formats: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv'], // MP4, MOV, AVI, WMV
      maxDurationSeconds: 12 * 60 * 60, // 12 hours
    },
  },

  // YouTube Shorts (separate constraint)
  youtube_shorts: {
    videos: {
      maxSizeBytes: 256 * 1024 * 1024 * 1024, // 256 GB
      formats: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv'],
      maxDurationSeconds: 60, // 60 seconds for Shorts
    },
  },

  // Facebook
  facebook: {
    images: {
      maxSizeBytes: 10 * 1024 * 1024, // 10 MB
      formats: ['image/jpeg', 'image/png', 'image/gif'],
    },
    videos: {
      maxSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      formats: ['video/mp4', 'video/quicktime'],
      codecs: ['h264'],
      maxDurationSeconds: 4 * 60 * 60, // 4 hours
      aspectRatioRange: { min: 9/16, max: 16/9 },
    },
    postLimits: {
      maxPostsPerDay: 25,
    },
  },

  // X (Twitter)
  twitter: {
    images: {
      maxSizeBytes: 15 * 1024 * 1024, // 15 MB on web (5 MB on mobile, but we use web)
      formats: ['image/jpeg', 'image/png', 'image/gif'],
    },
    videos: {
      maxSizeBytes: 512 * 1024 * 1024, // 512 MB
      formats: ['video/mp4', 'video/quicktime', 'video/webm'],
      maxDurationSeconds: 140, // 140 seconds for standard users
    },
  },

  // LinkedIn
  linkedin: {
    images: {
      maxSizeBytes: 5 * 1024 * 1024, // 5 MB
      formats: ['image/jpeg', 'image/png', 'image/gif'],
      maxWidthPx: 1080,
      maxHeightPx: 1080,
    },
    videos: {
      maxSizeBytes: 5 * 1024 * 1024 * 1024, // 5 GB
      formats: ['video/mp4'],
      codecs: ['h264'],
      audioCodecs: ['aac'],
      maxDurationSeconds: 10 * 60, // 10 minutes
    },
  },

  // Threads
  threads: {
    images: {
      maxSizeBytes: 8 * 1024 * 1024, // 8 MB per image
      formats: ['image/jpeg', 'image/png'],
    },
    videos: {
      maxSizeBytes: 100 * 1024 * 1024, // 100 MB
      formats: ['video/mp4', 'video/quicktime'],
      codecs: ['h264'],
      maxDurationSeconds: 5 * 60, // 5 minutes
    },
    postLimits: {
      maxPostsPerDay: 250,
    },
  },

  // Pinterest
  pinterest: {
    images: {
      maxSizeBytes: 20 * 1024 * 1024, // 20 MB
      formats: ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'],
    },
    videos: {
      maxSizeBytes: 2 * 1024 * 1024 * 1024, // 2 GB
      formats: ['video/mp4', 'video/quicktime'],
      maxDurationSeconds: 15 * 60, // 15 minutes
    },
    postLimits: {
      requiresDestinationUrl: true,
      requiresCoverImage: true, // for videos
      requiresBoardId: true,
    },
  },
};

/**
 * User-friendly platform names for error messages
 */
export const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  instagram_story: 'Instagram Stories',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  youtube_shorts: 'YouTube Shorts',
  facebook: 'Facebook',
  twitter: 'X (Twitter)',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  pinterest: 'Pinterest',
};

/**
 * Check if a platform supports image posting
 */
export function platformSupportsImages(platform: string): boolean {
  return !!PLATFORM_MEDIA_CONSTRAINTS[platform]?.images;
}

/**
 * Check if a platform supports video posting
 */
export function platformSupportsVideos(platform: string): boolean {
  return !!PLATFORM_MEDIA_CONSTRAINTS[platform]?.videos;
}

/**
 * Get the constraints for a specific platform
 */
export function getPlatformConstraints(platform: string): MediaConstraints | null {
  return PLATFORM_MEDIA_CONSTRAINTS[platform] || null;
}