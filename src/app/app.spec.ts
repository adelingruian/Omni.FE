import { TestBed } from '@angular/core/testing';
import { EMPTY, of } from 'rxjs';
import { App } from './app';
import { DisruptionsService } from './services/disruptions.service';
import { FlightsService } from './services/flights.service';

describe('App', () => {
  const flightsServiceMock = {
    getFlights: () => of([]),
    getAiSuggestedActions: () => of([]),
    executeAiSuggestedAction: (_payload: { toolName: string; parameters: Record<string, unknown> }) => of(undefined),
    getFlightsUpdates: () => EMPTY,
    getCopilotAlerts: () => [],
    startFlightsUpdates: () => undefined,
    stopFlightsUpdates: () => undefined
  };

  const disruptionsServiceMock = {
    getGates: () => of([{ gateId: 4, name: 'Gate 4' }]),
    getRunways: () => of([{ runwayId: 19, name: '19' }]),
    getBaggageConveyorBelts: () => of([{ baggageConveyorBeltId: 1, name: 'Carousel 1' }]),
    getDisruptions: () => of([]),
    createDisruption: () =>
      of({
        disruptionId: 1,
        resourceType: 'Gate',
        resourceId: 1,
        startsAt: '2026-03-06T00:00:00+02:00',
        endsAt: '2026-03-07T00:00:00+02:00',
        status: 'Solved'
      }),
    solveDisruption: () => of(undefined)
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: FlightsService, useValue: flightsServiceMock },
        { provide: DisruptionsService, useValue: disruptionsServiceMock }
      ]
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
