import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PoemScrollCard } from '../components/PoemScrollCard'

class TestAudio {
    static instances: TestAudio[] = []
    src: string
    currentTime = 0
    onended: (() => void) | null = null
    onerror: (() => void) | null = null
    readonly pause = vi.fn()
    readonly play = vi.fn(() => Promise.reject(new Error('playback blocked')))

    constructor(src: string) {
        this.src = src
        TestAudio.instances.push(this)
    }
}

describe('PoemScrollCard audio playback', () => {
    beforeEach(() => {
        TestAudio.instances = []
        vi.stubGlobal('Audio', TestAudio)
    })

    it('returns to the play state when the browser rejects audio.play()', async () => {
        render(<PoemScrollCard result={{ text: '春风', topic: '春日', audioBase64: 'YQ==' }} />)

        fireEvent.click(screen.getByRole('button', { name: '朗读' }))

        expect(TestAudio.instances[0].play).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(screen.getByRole('button', { name: '朗读' })).toBeInTheDocument())
        expect(screen.getByRole('alert')).toHaveTextContent('朗读暂时无法播放，请重试。')
    })

    it('stops and releases the audio element on unmount', () => {
        const { unmount } = render(
            <PoemScrollCard result={{ text: '春风', topic: '春日', audioBase64: 'YQ==' }} />
        )

        fireEvent.click(screen.getByRole('button', { name: '朗读' }))
        const audio = TestAudio.instances[0]
        unmount()

        expect(audio.pause).toHaveBeenCalledTimes(1)
        expect(audio.src).toBe('')
    })
})
