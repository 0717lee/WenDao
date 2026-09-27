import { useState, useRef, useCallback, useEffect } from 'react'
import { API_BASE } from '../lib/api'
import { authFetchOptions } from '../store/useAuthStore'

/**
 * useVoiceRecorder - Click-toggle voice recording hook.
 * Records audio via MediaRecorder, sends to /api/v1/speech/asr for transcription.
 * Replaces the old long-press AudioRecorder pattern.
 */
export function useVoiceRecorder() {
    const [isRecording, setIsRecording] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const activeStreamRef = useRef<MediaStream | null>(null)
    const recordingIdRef = useRef(0)
    const isMountedRef = useRef(true)
    const startInFlightRef = useRef(false)

    useEffect(() => {
        isMountedRef.current = true

        return () => {
            isMountedRef.current = false
            recordingIdRef.current += 1

            const recorder = mediaRecorderRef.current
            if (recorder && recorder.state !== 'inactive') {
                try {
                    recorder.stop()
                } catch {
                    // The tracks are stopped below even if the recorder is already closing.
                }
            }

            activeStreamRef.current?.getTracks().forEach((track) => track.stop())
            activeStreamRef.current = null
            mediaRecorderRef.current = null
        }
    }, [])

    const toggleRecording = useCallback(
        async (
            onTranscription: (text: string) => void,
            onError: (msg: string) => void
        ) => {
            if (isTranscribing) return

            if (isRecording) {
                // Stop recording -- onstop handler will send to ASR
                const recorder = mediaRecorderRef.current
                if (!recorder || recorder.state === 'inactive') {
                    if (isMountedRef.current) setIsRecording(false)
                    return
                }

                setIsRecording(false)
                setIsTranscribing(true)
                try {
                    recorder.stop()
                } catch {
                    activeStreamRef.current?.getTracks().forEach((track) => track.stop())
                    if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null
                    if (isMountedRef.current) {
                        setIsTranscribing(false)
                        onError('语音录音没有成功，请再试一次')
                    }
                }
            } else {
                // Start recording
                if (startInFlightRef.current) return
                startInFlightRef.current = true

                const recordingId = recordingIdRef.current + 1
                recordingIdRef.current = recordingId
                let stream: MediaStream | null = null

                try {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                    const isCurrentRecording = () =>
                        isMountedRef.current && recordingIdRef.current === recordingId

                    if (!isCurrentRecording()) {
                        stream.getTracks().forEach((track) => track.stop())
                        return
                    }

                    const recordingStream = stream
                    activeStreamRef.current = recordingStream
                    const recorder = new MediaRecorder(recordingStream)
                    const audioChunks: Blob[] = []

                    recorder.ondataavailable = (e) => {
                        if (e.data.size > 0) audioChunks.push(e.data)
                    }

                    recorder.onstop = async () => {
                        // Release mic
                        recordingStream.getTracks().forEach((t) => t.stop())
                        if (activeStreamRef.current === recordingStream) activeStreamRef.current = null
                        if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null

                        if (!isCurrentRecording()) return

                        setIsRecording(false)
                        if (audioChunks.length === 0) {
                            setIsTranscribing(false)
                            onError('没有录到清楚的声音，请再录一遍')
                            return
                        }

                        setIsTranscribing(true)
                        const blob = new Blob(audioChunks, { type: 'audio/webm' })
                        const formData = new FormData()
                        formData.append('file', blob, 'recording.webm')

                        try {
                            const resp = await fetch(`${API_BASE}/api/v1/speech/asr`, authFetchOptions({
                                method: 'POST',
                                body: formData,
                            }))
                            if (!resp.ok) throw new Error(`ASR request failed (${resp.status})`)
                            const data = await resp.json()
                            if (!isCurrentRecording()) return

                            if (data.text) {
                                onTranscription(data.text)
                            } else {
                                onError(data.error || '这段语音没识别出来，请换一句再试')
                            }
                        } catch {
                            if (isCurrentRecording()) {
                                onError('语音识别没有成功，请检查麦克风后再试，或直接输入问题')
                            }
                        } finally {
                            if (isCurrentRecording()) setIsTranscribing(false)
                        }
                    }

                    recorder.start()
                    mediaRecorderRef.current = recorder
                    setIsRecording(true)
                } catch (err) {
                    stream?.getTracks().forEach((track) => track.stop())
                    if (activeStreamRef.current === stream) activeStreamRef.current = null
                    console.error('[VoiceRecorder] Microphone access denied:', err)
                    if (isMountedRef.current && recordingIdRef.current === recordingId) {
                        setIsRecording(false)
                        setIsTranscribing(false)
                        onError('现在还不能使用麦克风，请先检查权限设置')
                    }
                } finally {
                    startInFlightRef.current = false
                }
            }
        },
        [isRecording, isTranscribing]
    )

    return { isRecording, isTranscribing, toggleRecording }
}
