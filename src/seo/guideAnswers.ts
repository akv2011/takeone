export const guideAnswers: Record<string, readonly { question: string; answer: string }[]> = {
  "/guides/ai-video-editing": [
    {
      "question": "Does AI editing generate new footage?",
      "answer": "Editing changes existing footage. Stock assembly combines existing clips with narration. Generating a new scene is a separate workflow and depends on an enabled video provider."
    },
    {
      "question": "What should an editing prompt include?",
      "answer": "Specify the source interval, action and output format. For example: trim 00:05 to 00:20, use 1.5x speed and fit the result into 9:16."
    }
  ],
  "/guides/youtube-to-shorts": [
    {
      "question": "Can I clip a YouTube video using exact timestamps?",
      "answer": "TakeOne accepts explicit source timestamps for clipping. Review the result to confirm that the selection includes the complete thought."
    },
    {
      "question": "Can every YouTube link be imported?",
      "answer": "No. Access restrictions or download failures can prevent import. If you own the original file, upload it through Edit instead."
    }
  ],
  "/guides/resize-video-for-reels": [
    {
      "question": "What is the difference between crop and fit?",
      "answer": "Crop fills the output frame by removing source edges. Fit keeps the whole source visible and may leave unused space."
    },
    {
      "question": "Does resizing improve video quality?",
      "answer": "A larger export does not restore missing source detail. Inspect text, faces and motion at the size your audience will watch."
    }
  ],
  "/guides/edit-video-captions": [
    {
      "question": "Can I remove captions burned into an uploaded video?",
      "answer": "The caption setting cannot remove text already embedded in the source pixels. Use an uncaptioned original when available."
    },
    {
      "question": "Does correcting caption text change the voice?",
      "answer": "No. Caption wording changes the visible text and preserves the existing cue timing and audio."
    }
  ],
  "/guides/change-video-speed": [
    {
      "question": "How long is a 30-second video at 3x speed?",
      "answer": "Approximately 10 seconds. Divide 30 by 3. Actual export duration can vary slightly at frame boundaries."
    },
    {
      "question": "Does previewing a speed change use a video credit?",
      "answer": "Local Studio playback preview does not submit a render. Applying the edit uses the normal video allowance."
    }
  ]
};
