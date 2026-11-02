import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App shell', () => {
  it('renders the product name and shared purpose labels (web ↔ shared wiring)', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Coditas Gate Pass' })).toBeInTheDocument();
    expect(screen.getByText(/Vendor \/ Delivery/)).toBeInTheDocument();
  });
});
