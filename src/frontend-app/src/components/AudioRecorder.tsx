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
                            onError('未录制到音频')
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
                                onError(data.error || '未能识别，请重新录音')
                            }
                        } catch {
                            onError('语音识别失败，请重试')
                        }
                        setIsTranscribing(false)
                    }

                    recorder.start()
                    mediaRecorderRef.current = recorder
                    setIsRecording(true)
                } catch (err) {
                    console.error('[VoiceRecorder] Microphone access denied:', err)
                    onError('无法访问麦克风，请授予权限')
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
