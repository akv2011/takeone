export const guides = [
  {
    path: '/guides/ai-video-editing', title: 'AI video editing with prompts: a practical guide',
    description: 'Learn how to write clear video editing prompts, choose between editing and generation, and review captions, framing and audio before publishing.',
    intro: 'AI video editing works best when you give it a specific job. Start with a clip you own, describe one change, and review the result before adding another.',
    sections: [
      { heading: 'Choose editing or generation', text: 'Editing changes footage you already have. Generation creates or assembles new material from an idea. A narrated video made with stock footage is different from an AI-generated scene. Decide which result you need before writing a prompt. In TakeOne, Edit uses uploaded footage, YouTube selects a moment from a link, and Create starts from a topic. Available providers determine which rendering options you can use.' },
      { heading: 'Write a prompt you can check', text: 'Name the action, timing and output format. Try: "Trim 00:05 to 00:20, speed it up to 1.5x, and fit it into a vertical 9:16 frame." That gives you visible criteria for reviewing the output. "Make this viral" does not specify an edit and cannot promise an audience response. For complicated edits, change one thing at a time so you can identify what improved the video.' },
      { heading: 'Keep words, timing and framing separate', text: 'Use caption controls for text style and corrections. Use trim controls for the start and end of a clip. Framing controls determine whether the source is cropped or fitted inside the output. A crop can remove a face, logo or demonstration step, so inspect the full shot, including motion near the edges. A fit preserves the frame but may leave space around it.' },
      { heading: 'Listen before you publish', text: 'Play the result with sound. Check the first spoken word, the final sentence and transitions between shots. Music should sit below speech. Replacing source audio removes dialogue and sound effects too; mixing keeps them. Confirm that names and numbers in captions match what was actually said. Keep your original footage so you can recover if an edit removes something useful.' },
      { heading: 'Try the workflow in TakeOne', text: 'Open the workspace, choose Edit and upload footage you have permission to use. Enter a concrete instruction, choose your format and inspect the result in Studio. Switching modes and exploring settings does not render a video. Rendering availability is shown in the workspace; if a service is being connected, its render action stays disabled.' },
    ],
  },
  {
    path: '/guides/youtube-to-shorts', title: 'How to turn a YouTube video into a short clip',
    description: 'Choose a self-contained moment from a YouTube video, set precise timestamps, reframe it vertically and check captions and audio for a short clip.',
    intro: 'A useful short clip tells one complete idea. Pick a moment that makes sense without the rest of the video, then adjust its timing and framing for the people watching it.',
    sections: [
      { heading: 'Start with a source you can use', text: 'Use your own video or material you have permission to repurpose. A publicly accessible YouTube link is not evidence of a reuse license. Keep the source link and any relevant permission with your project. If you already own the source file, uploading it can avoid the availability and download restrictions that sometimes affect links.' },
      { heading: 'Pick a beginning and an ending', text: 'Look for a question and answer, a demonstration, or a clear before-and-after moment. Start just before the information viewers need. Finish after the thought is complete rather than cutting in the middle of a word. Write down exact timestamps. For example: "Clip 01:12 to 01:42 from this video and make it vertical." Watch the selection once before requesting further changes.' },
      { heading: 'Reframe for a vertical screen', text: 'A landscape source often contains more information than a vertical crop can show. Keep the speaker or subject in view throughout the clip. Choose fit when cropping would hide a second speaker, a slide or a product detail. Check the top and bottom for captions and interface overlays. Preview on a phone as well as a wide desktop screen.' },
      { heading: 'Make the short understandable without context', text: 'Remove references such as "as I said earlier" if the viewer has not seen the earlier section. Correct caption spelling and make sure text is readable against changing backgrounds. A short opening title can explain the topic, but it should match the actual clip. Avoid adding claims that the speaker did not make.' },
      { heading: 'Use TakeOne and review the export', text: 'Choose YouTube in the TakeOne workspace, paste the link, describe the moment and confirm you have permission to use it. Explicit timestamps give you control over the selection. When clipping is unavailable, the workspace displays that status instead of submitting a render. Once you have an output, review speech, framing and the final cut before publishing it on your chosen platform.' },
    ],
  },
  {
    path: '/guides/resize-video-for-reels', title: 'Resize a video for Reels: crop, fit and captions',
    description: 'Prepare a vertical video from landscape footage. Compare crop and fit, choose a 9:16 frame, and keep faces, captions and product details visible.',
    intro: 'Changing aspect ratio changes what your audience sees. A good vertical edit keeps the important action visible and leaves enough room for captions and playback controls.',
    sections: [
      { heading: 'Choose the frame before polishing the edit', text: 'Use a 9:16 frame for a vertical composition, 1:1 for a square composition, or 16:9 for landscape. Aspect ratio describes the shape rather than image quality. A low-resolution source does not gain detail just because the export is larger. Pick the format that suits the destination and inspect its current upload requirements before publishing.' },
      { heading: 'Crop when the subject stays in view', text: 'Cropping fills the frame by removing some of the source image. It can work well for a centered speaker or product, but inspect the whole clip: a person may walk out of the crop halfway through. Check hands, props, text and logos, not only faces. For a two-person conversation or screen recording, a narrow crop may remove the information that makes the clip useful.' },
      { heading: 'Fit when you need the whole source', text: 'Fitting preserves the source frame inside the new shape. It may leave unused space, but it keeps slides, wide demonstrations and multiple speakers visible. Compare crop and fit on the same moment before choosing. Do not stretch the image to fill the screen; stretching changes proportions and can make faces or products look wrong.' },
      { heading: 'Check captions after reframing', text: 'Captions that were readable in a landscape video may be too small or may overlap the subject in a vertical version. Keep lines short and use contrast against the footage. Preview text near the edges on the destination platform because interface elements can cover it. Captions already burned into the source cannot be removed simply by switching a caption setting.' },
      { heading: 'Apply the edit in TakeOne', text: 'Choose Edit, upload your own footage and select the output aspect ratio in Settings. A prompt such as "Make this vertical using fit and keep the original audio" makes the intended change clear. Review the output in Studio, then adjust trim or captions as needed. Rendering depends on connected services, and the workspace shows whether the action is currently available.' },
    ],
  },
  {
    "path": "/guides/edit-video-captions",
    "title": "Edit video captions: text, style and placement",
    "description": "Correct video captions without changing the spoken audio. Learn when captions can be restyled, what burned-in text means, and how to check your export.",
    "intro": "Editable captions are a separate text layer. Text burned into a source video is part of its pixels. Knowing which you have determines whether you can correct, restyle or remove it.",
    "sections": [
      {
        "heading": "Check whether the captions are editable",
        "text": "In TakeOne Studio, caption editing depends on a retained clean video and timed caption data. Supported new renders can keep those files for later edits. An older export or an uploaded video may have no editable caption layer. Turning captions off does not erase text already visible in the source. Keep the original uncaptioned footage whenever possible."
      },
      {
        "heading": "Correct names without changing the audio",
        "text": "Listen to the sentence and compare it with the caption. Fix names, product terms and numbers first. Changing a caption changes the words viewers read, not the words the speaker says. For example, changing \"fifteen\" to \"fifty\" in the text does not repair incorrect speech. Use the source recording to decide which word is accurate."
      },
      {
        "heading": "Keep timing separate from wording",
        "text": "Caption text corrections retain the existing cue timings in TakeOne. Shorten a long correction if it cannot be read during that interval. Preview the first and last cue, pauses and fast speech. If the timings themselves are wrong, a wording correction alone will not fix them. Do not describe a text edit as a full transcription repair."
      },
      {
        "heading": "Choose a readable style and position",
        "text": "Compare a plain caption style with a more prominent style using the same shot. Avoid covering faces, demonstrations or existing labels. Studio offers supported placement choices when a caption archive is available. A bottom caption can overlap platform controls, so inspect the uploaded preview on the destination as well as the local export."
      },
      {
        "heading": "Review a new version before publishing",
        "text": "Opening an available caption editor is free. Applying a caption change creates a render and uses the normal video allowance. Check the new output for spelling, timing, framing and unchanged audio. Keep the earlier version until you have reviewed the result. Rendering remains subject to the availability shown in the workspace."
      }
    ]
  },
  {
    "path": "/guides/change-video-speed",
    "title": "Change video speed and calculate clip duration",
    "description": "Work out how long a sped-up clip will be, choose trim points, and review speech and captions. Includes a 3x speed example and a practical editing prompt.",
    "intro": "A clip at 3x speed lasts one third as long. Divide the selected source duration by the speed multiplier: a 30-second selection becomes approximately 10 seconds.",
    "sections": [
      {
        "heading": "Calculate the result before rendering",
        "text": "Use output duration = selected duration / speed. A 30-second selection lasts 20 seconds at 1.5x, 15 seconds at 2x and 10 seconds at 3x. At 0.5x it lasts 60 seconds. Container timestamps and frame boundaries can make the measured export slightly different. This calculation describes a constant speed change, not a speed ramp."
      },
      {
        "heading": "Trim first, then set the speed",
        "text": "Choose the source interval before estimating the result. Selecting 00:05 through 00:35 gives 30 seconds of footage. A concrete prompt is: \"Trim 00:05 to 00:35, play at 3x speed, and fit into 9:16.\" Verify each instruction in the output. Avoid combining unrelated edits until the selection and speed are right."
      },
      {
        "heading": "Choose a speed people can follow",
        "text": "A fast product demonstration may still communicate its action, while an interview at the same speed can become difficult to understand. Listen to the entire selection. Preview essential hand movements, on-screen instructions and transitions. Slow motion stretches the frames already recorded; it does not guarantee new detail or smooth intermediate motion."
      },
      {
        "heading": "Use the Studio preview",
        "text": "TakeOne Studio provides local playback preview controls for a selected trim and speed. Previewing does not submit a render. Applying the edit creates a new job using the normal allowance. The final encoded file is the version to inspect before publication; browser playback alone does not verify export quality or provider availability."
      },
      {
        "heading": "Check captions and the ending",
        "text": "A speed change reduces or extends the time available to read each caption. Watch the final file with sound and confirm that text follows speech. Check that the first word and the ending survive the trim. If speech becomes too fast, shorten the selection instead of forcing it into an unreadable duration. The workspace shows when rendering is available."
      }
    ]
  },
] as const;
