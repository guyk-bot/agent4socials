import { PLATFORM_MEDIA_CONSTRAINTS, PLATFORM_DISPLAY_NAMES, type MediaConstraints } from './platform-constraints';

export interface ValidationResult {
  isValid: boolean;
  violations: ValidationViolation[];
  canAutoFix: boolean;
  suggestedFixes?: MediaConversionOptions;
}

export interface ValidationViolation {
  type: 'size' | 'format' | 'duration' | 'codec' | 'dimensions' | 'aspect_ratio' | 'color_space';
  message: string;
  current: string | number;
  expected: string | number;
  severity: 'error' | 'warning';
}

export interface MediaConversionOptions {
  // Image conversion options
  targetFormat?: string; // 'image/jpeg', 'image/png'
  quality?: number; // 0.1 to 1.0
  maxWidth?: number;
  maxHeight?: number;
  
  // Video conversion options
  targetVideoFormat?: string; // 'video/mp4'
  videoQuality?: 'high' | 'medium' | 'low'; // Maps to bitrate/CRF values
  targetCodec?: string; // 'h264', 'hevc'
  targetAudioCodec?: string; // 'aac'
  
  // Common options
  maxFileSize?: number;
}

/**
 * Get file info from a File object
 */
export async function getFileInfo(file: File): Promise<{
  name: string;
  size: number;
  type: string;
  isImage: boolean;
  isVideo: boolean;
  extension: string;
  dimensions?: { width: number; height: number };
  duration?: number;
}> {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  
  const info = {
    name: file.name,
    size: file.size,
    type: file.type,
    isImage,
    isVideo,
    extension,
  };
  
  // Get dimensions for images
  if (isImage) {
    try {
      const dimensions = await getImageDimensions(file);
      return { ...info, dimensions };
    } catch (e) {
      console.warn('Could not get image dimensions:', e);
    }
  }
  
  // Get duration and dimensions for videos
  if (isVideo) {
    try {
      const videoInfo = await getVideoInfo(file);
      return { 
        ...info, 
        dimensions: videoInfo.dimensions,
        duration: videoInfo.duration 
      };
    } catch (e) {
      console.warn('Could not get video info:', e);
    }
  }
  
  return info;
}

/**
 * Get image dimensions from a File
 */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Get video info (dimensions, duration) from a File
 */
function getVideoInfo(file: File): Promise<{ dimensions: { width: number; height: number }; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        dimensions: { width: video.videoWidth, height: video.videoHeight },
        duration: video.duration
      });
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = url;
  });
}

/**
 * Validate a file against platform constraints
 */
export async function validateFileForPlatform(
  file: File,
  platform: string,
  postType?: 'feed' | 'story' | 'shorts'
): Promise<ValidationResult> {
  const fileInfo = await getFileInfo(file);
  const normalizedPlatform = platform.toLowerCase();
  const platformKey = postType ? `${normalizedPlatform}_${postType}` : normalizedPlatform;
  const constraints =
    PLATFORM_MEDIA_CONSTRAINTS[platformKey] || PLATFORM_MEDIA_CONSTRAINTS[normalizedPlatform];
  
  if (!constraints) {
    return {
      isValid: false,
      violations: [{
        type: 'format',
        message: `${PLATFORM_DISPLAY_NAMES[platform] || platform} is not supported`,
        current: platform,
        expected: 'supported platform',
        severity: 'error'
      }],
      canAutoFix: false
    };
  }

  const violations: ValidationViolation[] = [];
  let canAutoFix = true;

  // Check if platform supports this media type
  if (fileInfo.isImage && !constraints.images) {
    violations.push({
      type: 'format',
      message: `${PLATFORM_DISPLAY_NAMES[platform]} doesn't support image posts`,
      current: 'image',
      expected: 'video',
      severity: 'error'
    });
    canAutoFix = false;
  }

  if (fileInfo.isVideo && !constraints.videos) {
    violations.push({
      type: 'format',
      message: `${PLATFORM_DISPLAY_NAMES[platform]} doesn't support video posts`,
      current: 'video',
      expected: 'image',
      severity: 'error'
    });
    canAutoFix = false;
  }

  // Validate image constraints
  if (fileInfo.isImage && constraints.images) {
    const imageConstraints = constraints.images;
    
    // File size
    if (fileInfo.size > imageConstraints.maxSizeBytes) {
      violations.push({
        type: 'size',
        message: `Image is too large for ${PLATFORM_DISPLAY_NAMES[platform]}`,
        current: formatFileSize(fileInfo.size),
        expected: formatFileSize(imageConstraints.maxSizeBytes),
        severity: 'error'
      });
    }
    
    // Format
    if (!imageConstraints.formats.includes(fileInfo.type)) {
      violations.push({
        type: 'format',
        message: `Image format not supported by ${PLATFORM_DISPLAY_NAMES[platform]}`,
        current: fileInfo.type,
        expected: imageConstraints.formats.join(', '),
        severity: 'error'
      });
    }
    
    // Dimensions
    if (fileInfo.dimensions) {
      if (imageConstraints.maxWidthPx && fileInfo.dimensions.width > imageConstraints.maxWidthPx) {
        violations.push({
          type: 'dimensions',
          message: `Image width too large for ${PLATFORM_DISPLAY_NAMES[platform]}`,
          current: `${fileInfo.dimensions.width}px`,
          expected: `max ${imageConstraints.maxWidthPx}px`,
          severity: 'error'
        });
      }
      
      if (imageConstraints.maxHeightPx && fileInfo.dimensions.height > imageConstraints.maxHeightPx) {
        violations.push({
          type: 'dimensions',
          message: `Image height too large for ${PLATFORM_DISPLAY_NAMES[platform]}`,
          current: `${fileInfo.dimensions.height}px`,
          expected: `max ${imageConstraints.maxHeightPx}px`,
          severity: 'error'
        });
      }
    }
  }

  // Validate video constraints
  if (fileInfo.isVideo && constraints.videos) {
    const videoConstraints = constraints.videos;
    
    // File size
    if (fileInfo.size > videoConstraints.maxSizeBytes) {
      violations.push({
        type: 'size',
        message: `Video is too large for ${PLATFORM_DISPLAY_NAMES[platform]}`,
        current: formatFileSize(fileInfo.size),
        expected: formatFileSize(videoConstraints.maxSizeBytes),
        severity: 'error'
      });
    }
    
    // Format
    if (!videoConstraints.formats.includes(fileInfo.type)) {
      violations.push({
        type: 'format',
        message: `Video format not supported by ${PLATFORM_DISPLAY_NAMES[platform]}`,
        current: fileInfo.type,
        expected: videoConstraints.formats.join(', '),
        severity: 'error'
      });
    }
    
    // Duration
    if (fileInfo.duration && videoConstraints.maxDurationSeconds && 
        fileInfo.duration > videoConstraints.maxDurationSeconds) {
      violations.push({
        type: 'duration',
        message: `Video is too long for ${PLATFORM_DISPLAY_NAMES[platform]}`,
        current: formatDuration(fileInfo.duration),
        expected: formatDuration(videoConstraints.maxDurationSeconds),
        severity: 'error'
      });
      canAutoFix = false; // We don't trim videos
    }
    
    // Aspect ratio
    if (fileInfo.dimensions && videoConstraints.aspectRatioRange) {
      const aspectRatio = fileInfo.dimensions.width / fileInfo.dimensions.height;
      const { min, max } = videoConstraints.aspectRatioRange;
      
      if (aspectRatio < min || aspectRatio > max) {
        violations.push({
          type: 'aspect_ratio',
          message: `Video aspect ratio not supported by ${PLATFORM_DISPLAY_NAMES[platform]}`,
          current: `${aspectRatio.toFixed(2)}:1`,
          expected: `${min.toFixed(2)}:1 to ${max.toFixed(2)}:1`,
          severity: 'error'
        });
        canAutoFix = false; // We don't crop videos
      }
    }
  }

  // Generate suggested fixes if auto-fixable
  let suggestedFixes: MediaConversionOptions | undefined;
  
  if (canAutoFix && violations.length > 0) {
    suggestedFixes = generateConversionOptions(fileInfo, constraints, violations);
  }

  return {
    isValid: violations.length === 0,
    violations,
    canAutoFix,
    suggestedFixes
  };
}

/**
 * Generate conversion options to fix violations
 */
function generateConversionOptions(
  fileInfo: ReturnType<typeof getFileInfo> extends Promise<infer T> ? T : never,
  constraints: MediaConstraints,
  violations: ValidationViolation[]
): MediaConversionOptions {
  const options: MediaConversionOptions = {};

  const hasFormatViolation = violations.some(v => v.type === 'format');
  const hasSizeViolation = violations.some(v => v.type === 'size');
  const hasDimensionsViolation = violations.some(v => v.type === 'dimensions');

  if (typeof fileInfo === 'object' && 'isImage' in fileInfo) {
    if (fileInfo.isImage && constraints.images) {
      // Fix format issues
      if (hasFormatViolation) {
        // Prefer JPEG for Instagram, PNG for others if supported
        if (constraints.images.formats.includes('image/jpeg')) {
          options.targetFormat = 'image/jpeg';
          options.quality = 0.9; // High quality
        } else if (constraints.images.formats.includes('image/png')) {
          options.targetFormat = 'image/png';
        }
      }
      
      // Fix size issues
      if (hasSizeViolation) {
        options.maxFileSize = constraints.images.maxSizeBytes;
        options.quality = Math.max(0.7, (options.quality || 0.9) - 0.2); // Reduce quality
      }
      
      // Fix dimension issues
      if (hasDimensionsViolation && constraints.images.maxWidthPx) {
        options.maxWidth = constraints.images.maxWidthPx;
        options.maxHeight = constraints.images.maxHeightPx;
      }
    }
    
    if (fileInfo.isVideo && constraints.videos) {
      // Fix format issues
      if (hasFormatViolation) {
        if (constraints.videos.formats.includes('video/mp4')) {
          options.targetVideoFormat = 'video/mp4';
        }
      }
      
      // Fix codec issues
      if (constraints.videos.codecs?.includes('h264')) {
        options.targetCodec = 'h264';
      }
      if (constraints.videos.audioCodecs?.includes('aac')) {
        options.targetAudioCodec = 'aac';
      }
      
      // Fix size issues
      if (hasSizeViolation) {
        options.maxFileSize = constraints.videos.maxSizeBytes;
        options.videoQuality = 'medium'; // Reduce quality to fit size
      }
    }
  }

  return options;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format duration for display
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * Get user-friendly error message for validation failures
 */
export function getValidationErrorMessage(
  result: ValidationResult, 
  platform: string, 
  canConvert: boolean = true
): string {
  if (result.isValid) return '';
  
  const platformName = PLATFORM_DISPLAY_NAMES[platform] || platform;
  const errorViolations = result.violations.filter(v => v.severity === 'error');
  
  if (errorViolations.length === 0) return '';
  
  // If we can auto-fix, ask for permission
  if (result.canAutoFix && canConvert) {
    return `This file isn't compatible with ${platformName}. Would you like me to convert it for you?`;
  }
  
  // Otherwise, show specific error
  const violation = errorViolations[0];
  
  switch (violation.type) {
    case 'format':
      if (violation.message.includes("doesn't support")) {
        return violation.message;
      }
      return `This file format isn't compatible with ${platformName}. ${canConvert ? "Would you like me to convert it?" : "Please choose a different file."}`;
      
    case 'size':
      return `This file is too large for ${platformName}. ${canConvert ? "Would you like me to reduce the size?" : `Maximum size is ${violation.expected}.`}`;
      
    case 'duration':
      return `This video is too long for ${platformName}. Maximum length is ${violation.expected}.`;
      
    case 'dimensions':
      return `This file's dimensions are too large for ${platformName}. ${canConvert ? "Would you like me to resize it?" : `Maximum is ${violation.expected}.`}`;
      
    case 'aspect_ratio':
      return `This video's aspect ratio isn't supported by ${platformName}. Expected ${violation.expected}.`;
      
    default:
      return `This file isn't compatible with ${platformName}.`;
  }
}