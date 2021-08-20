import { mergeStyles } from '@fluentui/react';

const imagePreviewStyle = mergeStyles({
  maxWidth: '320px',
  maxHeight: '240px'
});

const imageLoadingStackStyle = mergeStyles({
  width: '320px',
  height: '240px'
});

export { imagePreviewStyle, imageLoadingStackStyle };
