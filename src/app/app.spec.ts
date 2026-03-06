import { TestBed } from '@angular/core/testing';
import { EMPTY, of } from 'rxjs';
import { App } from './app';
import { FlightsService } from './services/flights.service';

describe('App', () => {
  const flightsServiceMock = {
    getFlights: () => of([]),
    getFlightsUpdates: () => EMPTY,
    getCopilotAlerts: () => [],
    startFlightsUpdates: () => undefined,
    stopFlightsUpdates: () => undefined
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: FlightsService, useValue: flightsServiceMock }]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Disruption Copilot');
  });
});
