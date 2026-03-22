import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Clock from '../components/game/clock';

describe('Clock', () => {
    it('formats time correctly', () => {
        render(<Clock time={300} isActive={true} color="w" userId="u1" />);
        expect(screen.getByText('05:00')).toBeInTheDocument();
    });

    it('formats sub-minute time correctly', () => {
        render(<Clock time={45} isActive={false} color="b" userId="u1" />);
        expect(screen.getByText('00:45')).toBeInTheDocument();
    });

    it('applies danger class when time is under 30 seconds', () => {
        const { container } = render(<Clock time={25} isActive={true} color="w" userId="u1" />);
        expect(container.firstChild).toHaveClass('clock--danger');
    });

    it('applies active class when isActive is true', () => {
        const { container } = render(<Clock time={300} isActive={true} color="w" userId="u1" />);
        expect(container.firstChild).toHaveClass('clock--active');
    });

    it('shows 00:00 when time is 0', () => {
        render(<Clock time={0} isActive={false} color="w" userId="u1" />);
        expect(screen.getByText('00:00')).toBeInTheDocument();
    });
});