import { useState, useRef, useCallback } from 'react'
import { API_BASE } from '../lib/api'

/**
 * useVoiceRecorder - Click-toggle voice recording hook.
 * Records audio via MediaRecorder, sends to /api/v1/speech/asr for transcription.
 * Replaces the old long-press AudioRecorder pattern.
 */
export function useVoiceRecorder() {
    const [isRecording, setIsRecording] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const streamRef = useRef<MediaStream | null>(null)

    const toggleRecording = useCallback(
        async (
            onTranscription: (text: string) => void,
            onError: (msg: string) => void
        ) => {
            if (isRecording) {
                // Stop recording -- onstop handler will send to ASR
                mediaRecorderRef.current?.stop()
                setIsRecording(false)
            } else {
                // Start recording
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                    streamRef.current = stream
                    const recorder = new MediaRecorder(stream)
                    audioChunksRef.current = []

                    recorder.ondataavailable = (e) => {
                        if (e.data.size > 0) audioChunksRef.current.push(e.data)
                    }

                    recorder.onstop = async () => {
                        // Release mic
                        stream.getTracks().forEach((t) => t.stop())
                        streamRef.current = null

                        if (audioChunksRef.current.length === 0) {
      onError('没有录到清楚的声音，请再录一遍')
                            return
                        }

                        setIsTranscribing(true)
                        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                        const formData = new FormData()
                        formData.append('file', blob, 'recording.webm')

                        try {
                            const resp = await fetch(`${API_BASE}/api/v1/speech/asr`, {
                                method: 'POST',
                                body: formData,
                            })
                            const data = await resp.json()
                            if (data.text) {
                                onTranscription(data.text)
                            } else {
      onError(data.error || '这段语音没识别出来，请换一句再试')
                            }
                        } catch {
      onError('语音识别没有成功，请检查麦克风后再试，或直接输入问题')
                        }
                        setIsTranscribing(false)
                    }

                    recorder.start()
                    mediaRecorderRef.current = recorder
                    setIsRecording(true)
                } catch (err) {
                    console.error('[VoiceRecorder] Microphone access denied:', err)
      onError('现在还不能使用麦克风，请先检查权限设置')
                }
            }
        },
        [isRecording]
    )

    return { isRecording, isTranscribing, toggleRecording }
}

/**
 * Play TTS audio from base64-encoded data.
 * Used by ChatInterface for auto-read feature.
 */
export async function playTTSAudio(text: string): Promise<void> {
    try {
        const resp = await fetch(`${API_BASE}/api/v1/speech/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        })
        const data = await resp.json()
        if (data.audio_base64) {
            const audioSrc = `data:audio/mp3;base64,${data.audio_base64}`
            const audio = new Audio(audioSrc)
            audio.volume = 0.8
            await audio.play().catch((err) =>
                console.warn('[TTS] Autoplay blocked by browser:', err)
            )
        }
    } catch (e) {
        console.warn('[TTS] Playback failed:', e)
    }
}
