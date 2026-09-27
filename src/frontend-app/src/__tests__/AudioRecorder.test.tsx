import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceRecorder } from '../components/AudioRecorder'

class TestMediaRecorder {
    static instances: TestMediaRecorder[] = []
    state: 'inactive' | 'recording' | 'paused' = 'inactive'
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    readonly start = vi.fn(() => {
        this.state = 'recording'
    })
    readonly stop = vi.fn(() => {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['audio']) })
        this.onstop?.()
    })

    constructor(_stream: MediaStream) {
        TestMediaRecorder.instances.push(this)
    }
}

function RecorderHarness({
    onTranscription,
    onError,
}: {
    onTranscription: (text: string) => void
    onError: (message: string) => void
}) {
    const recorder = useVoiceRecorder()

    return (
        <>
            <button onClick={() => void recorder.toggleRecording(onTranscription, onError)}>toggle</button>
            <output>{recorder.isRecording ? 'recording' : recorder.isTranscribing ? 'transcribing' : 'idle'}</output>
        </>
    )
}

describe('useVoiceRecorder', () => {
    const trackStop = vi.fn()
    const getUserMedia = vi.fn()

    beforeEach(() => {
        TestMediaRecorder.instances = []
        trackStop.mockReset()
        getUserMedia.mockReset()
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        })
        vi.stubGlobal('MediaRecorder', TestMediaRecorder)
        vi.mocked(global.fetch).mockReset()
    })

    it('stops the recorder and microphone tracks when the hook unmounts', async () => {
        const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream
        getUserMedia.mockResolvedValue(stream)

        const { unmount } = render(
            <RecorderHarness onTranscription={vi.fn()} onError={vi.fn()} />
        )
        fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
        await waitFor(() => expect(screen.getByText('recording')).toBeInTheDocument())

        unmount()

        expect(TestMediaRecorder.instances[0].stop).toHaveBeenCalledTimes(1)
        expect(trackStop).toHaveBeenCalled()
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('releases the stream and reports a successful transcription after stopping', async () => {
        const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream
        getUserMedia.mockResolvedValue(stream)
        vi.mocked(global.fetch).mockResolvedValue({
            ok: true,
            json: async () => ({ text: '识别结果' }),
        } as Response)
        const onTranscription = vi.fn()

        render(<RecorderHarness onTranscription={onTranscription} onError={vi.fn()} />)
        fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
        await waitFor(() => expect(screen.getByText('recording')).toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

        await waitFor(() => expect(onTranscription).toHaveBeenCalledWith('识别结果'))
        expect(trackStop).toHaveBeenCalled()
        expect(screen.getByText('idle')).toBeInTheDocument()
    })
})
