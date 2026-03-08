import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface DisruptionRecord {
  disruptionId: number;
  resourceType: string;
  resourceId: number | string;
  startsAt: string;
  endsAt: string | null;
  status: string;
}

export interface CreateDisruptionPayload {
  resourceType: string;
  resourceId: number;
  startsAt?: string;
  endsAt?: string;
}

export interface GateRecord {
  gateId: number;
  name: string;
}

export interface RunwayRecord {
  runwayId: number;
  name: string;
}

export interface BaggageConveyorBeltRecord {
  baggageConveyorBeltId: number;
  name?: string;
}

@Injectable({ providedIn: 'root' })
export class DisruptionsService {
  private readonly http = inject(HttpClient);
  private readonly disruptionsApiUrl = 'http://localhost:5167/disruptions';
  private readonly adminApiUrl = 'http://localhost:5167/admin';
  private readonly gatesApiUrl = 'http://localhost:5167/gates';
  private readonly runwaysApiUrl = 'http://localhost:5167/runways';
  private readonly baggageConveyorBeltsApiUrl = 'http://localhost:5167/baggageconveyorbelts';

  getGates(): Observable<GateRecord[]> {
    return this.http.get<GateRecord[]>(this.gatesApiUrl);
  }

  getRunways(): Observable<RunwayRecord[]> {
    return this.http.get<RunwayRecord[]>(this.runwaysApiUrl);
  }

  getBaggageConveyorBelts(): Observable<BaggageConveyorBeltRecord[]> {
    return this.http.get<BaggageConveyorBeltRecord[]>(this.baggageConveyorBeltsApiUrl);
  }

  getDisruptions(): Observable<DisruptionRecord[]> {
    return this.http.get<DisruptionRecord[]>(this.disruptionsApiUrl);
  }

  createDisruption(payload: CreateDisruptionPayload): Observable<DisruptionRecord> {
    return this.http.post<DisruptionRecord>(this.disruptionsApiUrl, payload);
  }

  solveDisruption(id: number): Observable<void> {
    return this.http.post<void>(`${this.disruptionsApiUrl}/${id}/solve`, {});
  }

  resetDatabase(): Observable<void> {
    return this.http.delete<void>(`${this.adminApiUrl}/reset`);
  }
}
