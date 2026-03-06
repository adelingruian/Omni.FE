import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface FlightRecord {
  flightId: number;
  flightNumber: string;
  aircraft: string;
  origin: string;
  destination: string;
  scheduledDeparture: string;
  actualDeparture: string | null;
  scheduledArrival: string;
  actualArrival: string | null;
  gate: string;
  runway: string;
  passengerNumber: number;
  delayMinutes: number;
  crewPilots: number;
  crewFlightAttendants: number;
  baggageConveyorBelt: string;
  baggageTotalChecked: number;
}

export interface CopilotAlert {
  id: number;
  tone: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  actionLabel?: string;
}

@Injectable({ providedIn: 'root' })
export class FlightsService {
  private readonly http = inject(HttpClient);
  private readonly flightsApiUrl = 'http://localhost:5167/flights';

  private readonly copilotAlerts: CopilotAlert[] = [
    {
      id: 1,
      tone: 'critical',
      title: 'Cascading Turnaround Delay',
      message:
        'Aircraft EI-EBA arriving as RYR441 is 150 mins delayed. Departure RYR442 cannot depart at 17:30Z.',
      actionLabel: 'Auto-Reschedule RYR442'
    },
    {
      id: 2,
      tone: 'warning',
      title: 'Baggage System Conflict',
      message:
        'LH1654 and BA882 are both arriving delayed between 12:20Z and 12:30Z and are both assigned to Carousel 1. Total bags: 215.',
      actionLabel: 'Reassign BA882 to Carousel 2'
    },
    {
      id: 3,
      tone: 'info',
      title: 'Crew Requirement met',
      message: 'Standby crew for LH1655 verified and ready at Gate 2.'
    }
  ];

  getFlights(): Observable<FlightRecord[]> {
    return this.http.get<FlightRecord[]>(this.flightsApiUrl);
  }

  getCopilotAlerts(): CopilotAlert[] {
    return this.copilotAlerts;
  }
}